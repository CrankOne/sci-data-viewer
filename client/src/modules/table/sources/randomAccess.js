// "Random-access" TableDataSource (doc/module-table.rst's "Row access"):
// rows are fetched on demand via connection.js's dedicated
// `fetch_row_window` action -- never `list_resource_items`, whose contract
// is item-enumeration only (doc/sources.rst's "Row-window pagination" is
// the distinct wire convention this uses instead). Sorting (doc's
// "Sorting": "for remote or large resources, sorting should normally be
// delegated to the backend") is forwarded as `sort-column`/`sort-direction`
// query params on that same fetch -- a convention local to this adapter and
// its demo backend, not part of doc/sources.rst's own row-window spec.
//
// Phase-2 scope: pages are requested strictly in order, starting at
// whichever row position is already cached (see controller.js) -- true
// arbitrary-position windowing (jumping straight to an uncached middle
// page) is deferred until TanStack Virtual's scroll-driven access actually
// needs it (doc's "Open questions").
export function make_random_access_source({store, resourceName, itemId, pageSize}) {
    // Only the first entry of a sort spec is forwarded -- see local.js's
    // identical note on why that's not a real limitation yet.
    let sortSpec = null;

    return {
        kind: 'random-access',
        capabilities: {
            randomAccess: true,
            sequential: false,
            finite: true,
            sort: true,
            pivot: false,
            plot: true,
            export: false
        },
        set_sort(spec) {
            sortSpec = spec?.[0] ?? null;
        },
        async fetch_range(start, count) {
            // The fixed page size (from the resource's own descriptor,
            // doc/sources.rst's `rows.page-size`) determines which page
            // covers `start` -- count is advisory, satisfied by whatever
            // that one page returns rather than assembled across several.
            const page = Math.floor(start / pageSize);
            const body = await store.dispatch('connection/fetch_row_window', {
                name: resourceName,
                page,
                pageSize,
                itemId,
                sortColumn: sortSpec?.column,
                sortDirection: sortSpec?.direction
            });
            // doc/sources.rst's "Row-window pagination" is envelope-
            // agnostic (like every other wire shape it defines); a "table"
            // resource still wraps its response in the module-specific
            // `tableData` envelope, same as its normal whole-payload fetch
            // (doc/module-table.rst, modules/table/index.js's payload()).
            const table = body?.tableData ?? {};
            return {
                rows: table.rows ?? [],
                total: table.total ?? null
            };
        }
    };
}
