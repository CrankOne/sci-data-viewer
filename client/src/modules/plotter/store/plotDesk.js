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
import { with_data_source_facet, matches_facets_selector } from '@/store/facets';
import { resolve_incoming_sink_items } from '@/store/sinkResolve';

export function make_plot_desk_module(contextId) {
    // A plot source's raw fetched body is shaped `{plotData: {primitives}}`
    // (doc/module-plotter.rst's "plotData" envelope) -- mirrors the old
    // payload()'s unwrap. Every primitive gets a `dataSource` facet merged into its own
    // `_facets` (store/facets.js) -- doc/module-plotter.rst's per-item
    // convention, now guaranteed present regardless of what the source
    // itself declares -- then the resource's own facetsSelector, if any,
    // narrows the list down (doc/data-model.rst's "One input concept per
    // scope, not two").
    function normalize_plot_payload(rawData, resourceName, facetsSelector) {
        const primitives = rawData?.plotData?.primitives ?? [];
        return primitives
            .map(item => with_data_source_facet(item, resourceName))
            .filter(item => matches_facets_selector(item._facets, facetsSelector))
            // Position-based id, minted after facet filtering so it stays
            // dense (no gaps from filtered-out items) -- fine since a
            // resource's array is always replaced wholesale, never diffed
            // in place (this file's own header comment), so index
            // stability within one payload is all a hover/selection id
            // needs (doc/module-plotter.rst's "Open questions").
            .map((item, index) => ({...item, _id: `${resourceName}#${index}`}));
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
                    .map(r => [r.name, normalize_plot_payload(r.data, r.name, r.facetsSelector)])
            ),
            allPrimitives: (state, getters) => Object.values(getters.primitivesByResource).flat()
        }
    };
}

// Sink-forwarded primitives (doc/ui-session.rst's "Selection sinks"), read
// live off this context's own sinkInbox sub-state (store/sinkInbox.js's
// make_sink_inbox_module, registered alongside plotDesk in modules/plotter/
// index.js) -- kept out of plotDesk's own `allPrimitives` above (a sink
// item's forwarded data is never mistaken for a directly-attached
// resource's own), but exposed here as a plain function (not a Vuex
// getter) so it's reusable both by PlotViewport.vue's own rendering and by
// index.js's buildSinkSnapshot/resolveSinkItem (a selected primitive may be
// either a desk primitive or one forwarded in from elsewhere, e.g. an FSM
// node's own dashed pulse curves -- doc/module-plotter.rst's "Subject
// data" primitives don't exist on directly-loaded plot sources today,
// only on sink-forwarded ones). `_id` minted the same way as plotDesk's
// own -- `${originRef}#${index}`, unique per forwarded primitive within
// this context regardless of which origin item it came from.
export function resolve_forwarded_primitives(store, contextId) {
    const incoming = store.getters[`sinkInbox_${contextId}/incomingList`] ?? [];
    return resolve_incoming_sink_items(store, incoming).flatMap(item =>
        (item.snapshot?.primitives ?? []).map((p, index) => ({...p, _id: `${item.originRef}#${index}`}))
    );
}
