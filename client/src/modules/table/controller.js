// TableController (doc/module-table.rst's "Architecture"): owns the
// logical row window, row cache, loading/error state, and navigation for
// one context's primary table, so the view (TableViewport.vue) never talks
// to pagination/transport details directly -- it only ever reads
// `state.rows`/`state.schema`/`state.total`/`state.loading` and calls
// `load_more()`.
//
// Deliberately plain Vue reactivity, not another Vuex module: the row
// cache accumulated here is view-specific and ephemeral (never persisted,
// never read by another component), unlike tableDesk's own state, which is
// resource-derived and shared -- the same distinction PlotViewport.vue
// draws between its own local zoom/pan `ref`s and store/plotDesk.js.
//
// Phase-2 scope: one context has at most one browsed table
// (tableDesk_<ctx>/primaryTableEntry) and rows are fetched strictly in
// order, starting wherever the cache currently ends -- see
// sources/randomAccess.js's own note on why arbitrary-position windowing
// is deferred (doc's "Open questions").
import { reactive, computed, watch, unref } from 'vue';
import { make_local_source } from './sources/local';
import { make_random_access_source } from './sources/randomAccess';

const DEFAULT_PAGE_SIZE = 100;

export function use_table_controller(store, contextIdRef) {
    const state = reactive({
        schema: null,
        rows: [],
        total: null,
        loading: false,
        error: null,
        exhausted: true,
        sourceKind: null,
        capabilities: null,
        // doc/module-table.rst's "Sorting": an array of {column, direction},
        // even though only the first entry is currently applied anywhere
        // (composing several keys is a straightforward extension of
        // apply_local_sort()/the row-window sort params, not yet needed) --
        // null means unsorted (source's own natural order).
        sort: null
    });

    let dataSource = null;

    function reset_from_entry(entry) {
        state.error = null;
        state.sort = null;

        if(!entry) {
            dataSource = null;
            state.schema = null;
            state.rows = [];
            state.total = null;
            state.exhausted = true;
            state.sourceKind = null;
            state.capabilities = null;
            return;
        }

        state.schema = entry.schema;

        const resource = store.state.connection.resources[entry.name];
        const rowsCapability = resource?.manifest?.rows;

        if(rowsCapability?.windowed) {
            // The first page already arrived via the normal connection.js
            // payload pipeline (entry.rows) -- seed the cache with it
            // instead of re-fetching page 0.
            dataSource = make_random_access_source({
                store,
                resourceName: entry.name,
                pageSize: rowsCapability['page-size'] ?? DEFAULT_PAGE_SIZE
            });
            state.sourceKind = 'random-access';
            state.rows = entry.rows;
            state.total = entry.total ?? null;
            state.exhausted = state.total !== null && state.rows.length >= state.total;
        } else {
            dataSource = make_local_source({rows: entry.rows});
            state.sourceKind = 'local';
            state.rows = entry.rows;
            state.total = entry.rows.length;
            state.exhausted = true;
        }
        state.capabilities = dataSource.capabilities;
    }

    // Applying a new sort order invalidates the current logical row
    // ordering and its cache (doc's "Sorting"): re-seeds the source with
    // the new order (a no-op resort for `local`, a fresh param for
    // `random-access`) and starts the row window over from position 0.
    async function set_sort(spec) {
        if(!dataSource?.capabilities.sort) return;
        state.sort = spec;
        dataSource.set_sort(spec);
        state.rows = [];
        state.exhausted = false;
        await load_more();
    }

    async function load_more(count = DEFAULT_PAGE_SIZE) {
        if(!dataSource || state.loading || state.exhausted) return;
        state.loading = true;
        state.error = null;
        try {
            const result = await dataSource.fetch_range(state.rows.length, count);
            state.rows = [...state.rows, ...result.rows];
            if(result.total !== null && result.total !== undefined) state.total = result.total;
            if(result.rows.length === 0 || (state.total !== null && state.rows.length >= state.total)) {
                state.exhausted = true;
            }
        } catch(error) {
            state.error = error?.message ?? String(error);
        } finally {
            state.loading = false;
        }
    }

    const primaryEntry = computed(() => {
        const contextId = unref(contextIdRef);
        if(!contextId) return null;
        return store.getters[`tableDesk_${contextId}/primaryTableEntry`] ?? null;
    });

    watch(primaryEntry, reset_from_entry, {immediate: true});

    return {state, load_more, set_sort};
}
