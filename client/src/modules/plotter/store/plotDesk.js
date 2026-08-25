// Per-context "desk" state (doc/module-plotter.rst's "Desks" section): one
// merged view over every data source attached to this plot -- registered as
// this module's own contextStoreModules entry (modules/plotter/index.js),
// the same generic per-context mechanism any contextual viewer module uses
// (doc/ui-session.rst's "Extension points").
//
// A desk does NOT diff/sync items by identity: the plotter has no primitive
// that needs one item replaced without rebuilding the rest (there's no
// per-event-style incremental case here), so a resource's payload is just
// replaced wholesale on every update, keyed by resource name so several
// sources can share one desk without colliding. `primitivesByResource` used
// to be an owned copy, pushed in by connection.js's apply_resource_data and
// kept in this module's own committed state (store/keyedCollection.js, the
// same "keyed by contributor, wholesale replace" shape store/sinkInbox.js's
// landing zone still uses -- that one is unrelated to this change, see its
// own file); doc/data-model.rst's "Resolution is always live, never copied"
// retired that here -- it's now a getter reading straight from
// connection.js's own `resources`, which keeps each resource's last-fetched
// raw payload on the resource record itself.
export function make_plot_desk_module(contextId) {
    // A plot source's raw fetched body is shaped `{plotData: {primitives}}`
    // (doc/module-plotter.rst's "plotData" envelope) -- mirrors the old
    // payload()'s unwrap. `subjectData` has no consumer yet (its shape is
    // still an open question in that doc), so only primitives are forwarded.
    function normalize_plot_payload(rawData) {
        return rawData?.plotData?.primitives ?? [];
    }

    return {
        namespaced: true,

        // No state of its own left -- everything this desk shows is
        // derived live by the getters below.
        state: () => ({}),

        getters: {
            // Live view over connection.js's own resources -- every plot
            // source currently attached to this context, keyed by resource
            // name.
            primitivesByResource: (state, getters, rootState) => Object.fromEntries(
                Object.values(rootState.connection.resources)
                    .filter(r => r.contextId === contextId && r.type === 'plot' && r.data != null)
                    .map(r => [r.name, normalize_plot_payload(r.data)])
            ),
            allPrimitives: (state, getters) => Object.values(getters.primitivesByResource).flat()
        }
    };
}
