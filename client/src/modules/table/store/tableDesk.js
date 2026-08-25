// Per-context "desk" state (doc/module-table.rst's "Architecture"/"Table
// data source" sections): the directly-loaded table(s) attached to this
// context -- registered as this module's own contextStoreModules entry
// (modules/table/index.js), the same generic per-context mechanism any
// contextual viewer module uses (doc/ui-session.rst's "Extension points").
//
// Like the plotter's own desk (modules/plotter/store/plotDesk.js), a
// resource's payload is replaced wholesale on every update rather than
// diffed by row identity -- keyed by resource name so several sources can
// share one table context without colliding. `tablesByResource` used to be
// an owned copy, pushed in by connection.js's apply_resource_data and kept
// in this module's own committed state (store/keyedCollection.js);
// doc/data-model.rst's "Resolution is always live, never copied" retired
// that here -- it's now a getter reading straight from connection.js's own
// `resources`, which keeps each resource's last-fetched raw payload on the
// resource record itself.
export function make_table_desk_module(contextId) {
    // A table source's raw fetched body is shaped `{tableData: {schema,
    // rows, total?}}` (doc/module-table.rst's "tableData" envelope) --
    // mirrors the old payload()'s unwrap. `total` falls back to this
    // (first) page's own row count for a source that isn't row-windowed
    // (doc/sources.rst's "Row-window pagination"), so a local table's
    // `total` is correct without the source needing to declare one itself.
    function normalize_table_payload(rawData) {
        const table = rawData?.tableData ?? null;
        return table && {...table, total: table.total ?? table.rows?.length ?? 0};
    }

    return {
        namespaced: true,

        // No state of its own left -- everything this desk shows is
        // derived live by the getters below.
        state: () => ({}),

        getters: {
            // Live view over connection.js's own resources -- every table
            // source currently attached to this context, keyed by resource
            // name.
            tablesByResource: (state, getters, rootState) => Object.fromEntries(
                Object.values(rootState.connection.resources)
                    .filter(r => r.contextId === contextId && r.type === 'table' && r.data != null)
                    .map(r => [r.name, normalize_table_payload(r.data) ?? {schema: {columns: []}, rows: [], total: 0}])
            ),
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
            primaryTableEntry: (state, getters) => {
                const [name, table] = Object.entries(getters.tablesByResource)[0] ?? [];
                return name ? {name, ...table} : null;
            }
        }
    };
}
