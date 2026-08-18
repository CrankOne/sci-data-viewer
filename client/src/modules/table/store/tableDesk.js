// Per-context "desk" state (doc/module-table.rst's "Architecture"/"Table
// data source" sections): the directly-loaded table(s) attached to this
// context -- registered as this module's own contextStoreModules entry
// (modules/table/index.js), the same generic per-context mechanism any
// contextual viewer module uses (doc/ui-session.rst's "Extension points").
//
// Like the plotter's own desk (modules/plotter/store/plotDesk.js), a
// resource's payload is replaced wholesale on every update rather than
// diffed by row identity -- keyed by resource name so several sources can
// share one table context without colliding (store/keyedCollection.js).
import { make_keyed_collection } from '@/store/keyedCollection';

export function make_table_desk_module() {
    const keyed = make_keyed_collection({
        stateKey: 'tablesByResource',
        setMutation: '_set_table',
        removeMutation: 'remove_table_data',
        normalizeValue: table => table ?? {schema: {columns: []}, rows: [], total: 0}
    });

    return {
        namespaced: true,

        state: keyed.state,

        getters: {
            ...keyed.getters,
            // The initial implementation scope (doc/module-table.rst) is one
            // browsed table per context; this surfaces the first attached
            // resource's table, plus the resource *name* that owns it (a
            // random-access table's controller.js needs it to fetch further
            // pages) -- a real multi-source picker/merge (several tabular
            // sources sharing one context, same as three-view/plotter
            // already allow) isn't designed yet, see the doc's
            // "Open questions". `total` here is only ever this resource's
            // *first-loaded* page's count (or the server's own declared
            // total for a row-windowed source) -- controller.js's own
            // accumulated row count, once more pages are fetched, is
            // tracked separately (never written back here, see that file).
            primaryTableEntry: state => {
                const [name, table] = Object.entries(state.tablesByResource)[0] ?? [];
                return name ? {name, ...table} : null;
            }
        },

        mutations: {
            ...keyed.mutations,
            update_table_data(state, {name, table}) {
                keyed.mutations._set_table(state, {key: name, value: table});
            }
        }
    };
}
