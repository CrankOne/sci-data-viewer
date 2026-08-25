// Per-context "board" state (doc/module-graph.rst's "Boards"): one merged
// node/edge view over every data source attached to this board --
// registered as this module's own contextStoreModules entry
// (modules/graph/index.js), the same generic per-context mechanism any
// contextual viewer module uses (doc/ui-session.rst's "Extension points").
//
// A board does not diff/sync items by identity: a resource's nodes/edges
// are simply replaced wholesale on every update, keyed by resource name so
// several sources can share one board without colliding. `dataByResource`
// used to be an owned copy, pushed in by connection.js's apply_resource_data
// and kept in this module's own committed state (store/keyedCollection.js);
// doc/data-model.rst's "Resolution is always live, never copied" retired
// that -- it's now a getter reading straight from connection.js's own
// `resources`, which keeps each resource's last-fetched raw payload on the
// resource record itself.
import { selection_node_id, selection_edge_id, selection_cluster_id } from '../ids';

export function make_graph_board_module(contextId) {
    // A graph source's raw fetched body is shaped `{graphData: {nodes,
    // edges, layout, nestedGraphs, clusters}}` (doc/module-graph.rst's
    // "graphData" envelope) -- mirrors the old payload()'s unwrap.
    function normalize_graph_payload(rawData) {
        const graph = rawData?.graphData ?? null;
        return {
            nodes: graph?.nodes ?? [],
            edges: graph?.edges ?? [],
            layout: graph?.layout ?? null,
            // Drill-down targets (doc/module-graph.rst's "Nested graphs"):
            // other addressable items of this same resource rendering a
            // structurally-nested sub-graph this payload's own nodes/edges
            // omit (e.g. na64umff's per-domain breakdown sub-fits). Opaque
            // {itemId, path, label} list, never interpreted beyond that.
            nestedGraphs: graph?.nestedGraphs ?? [],
            // Named regions (doc/module-graph.rst's "Clusters") a node may
            // declare membership in via its own `cluster` field -- e.g.
            // na64umff's per-domain breakdown sub-fits, one cluster per
            // domain. Rendered, not interactive (see allClusters below).
            clusters: graph?.clusters ?? []
        };
    }

    return {
        namespaced: true,

        state: () => ({
            // One remembered drill state per resource -- the item to
            // return to when the user backs out of a drill-down (see
            // "Nested graphs" above). `{rootItemId, drilledItemId}`:
            // `drilledItemId` is compared against the resource's own live
            // `selectedItemId` (connection.js) by the `drillRoot` getter
            // below, so a stale entry (from an earlier drill into a
            // *different* top-level item of this same resource) is masked
            // rather than silently reused -- unlike the old owned-copy
            // version, nothing here ever gets an implicit mutation-time
            // clear any more (there's no longer a payload-arrival mutation
            // to hang that side effect on), so staleness has to be judged
            // at read time instead. Exactly one level deep: a source is
            // expected to never advertise nestedGraphs on an already-
            // drilled-into item (na64umff.py's own drill-down responses
            // never set it), so there is nothing to push/pop.
            drillRootByResource: {}
        }),

        getters: {
            // Live view over connection.js's own resources -- every graph
            // source currently attached to this context, keyed by resource
            // name. Downstream getters below all read this instead of
            // state directly.
            dataByResource: (state, getters, rootState) => Object.fromEntries(
                Object.values(rootState.connection.resources)
                    .filter(r => r.contextId === contextId && r.type === 'graph' && r.data != null)
                    .map(r => [r.name, normalize_graph_payload(r.data)])
            ),

            // Every resource's advertised drill-down targets, tagged with
            // the resource they belong to -- needed to know which resource
            // to re-fetch when one is picked (NestedGraphsPanel.vue).
            allNestedGraphs: (state, getters) => Object.entries(getters.dataByResource).flatMap(
                ([resourceName, data]) => (data.nestedGraphs ?? []).map(entry => ({...entry, resourceName}))
            ),

            // The itemId to return to for `resourceName`, or null when not
            // currently drilled into anything, or when the remembered entry
            // no longer matches what's actually loaded (see state comment
            // above) -- e.g. the user drilled into a different top-level
            // item of the same resource since the entry was recorded.
            drillRoot: (state, getters, rootState) => resourceName => {
                const entry = state.drillRootByResource[resourceName];
                if(!entry) return null;
                const resource = rootState.connection.resources[resourceName];
                return resource?.selectedItemId === entry.drilledItemId ? entry.rootItemId : null;
            },

            // Every resource's nodes, composite-id'd (ids.js) so several
            // sources sharing this board never collide (doc's "Boards"). A
            // node's own `cluster` field (a local cluster id) is rewritten
            // to that cluster's composite id the same way an edge's
            // `from`/`to` already is below (doc's "Clusters").
            allNodes: (state, getters) => Object.entries(getters.dataByResource).flatMap(
                ([resourceName, data]) => data.nodes.map(node => ({
                    ...node,
                    resourceName,
                    compositeId: selection_node_id(resourceName, node._id),
                    ...(node.cluster ? {cluster: selection_cluster_id(resourceName, node.cluster)} : {})
                }))
            ),

            // Every resource's clusters, composite-id'd the same way --
            // non-interactive decoration (doc's "Clusters": "no selection,
            // no hover"), so unlike allNodes/allEdges this doesn't
            // participate in the shared `selection` context module at all.
            allClusters: (state, getters) => Object.entries(getters.dataByResource).flatMap(
                ([resourceName, data]) => (data.clusters ?? []).map(cluster => ({
                    ...cluster,
                    resourceName,
                    compositeId: selection_cluster_id(resourceName, cluster._id)
                }))
            ),

            // Every resource's edges, composite-id'd the same way, with
            // from/to rewritten to their endpoint's own compositeId --
            // resolved against that *same* resource's own node set only
            // (doc's "Edges": "an edge referencing a node outside its own
            // source's node set is invalid"). An edge whose from/to can't
            // be resolved is dropped rather than passed through broken.
            allEdges: (state, getters) => {
                const dataByResource = getters.dataByResource;
                const localNodeIdsByResource = new Map(
                    Object.entries(dataByResource).map(
                        ([resourceName, data]) => [resourceName, new Set(data.nodes.map(node => node._id))]
                    )
                );

                return Object.entries(dataByResource).flatMap(([resourceName, data]) => {
                    const localNodeIds = localNodeIdsByResource.get(resourceName);
                    return data.edges
                        .filter(edge => {
                            const valid = localNodeIds.has(edge.from) && localNodeIds.has(edge.to);
                            if(!valid) {
                                console.warn(
                                    `Dropping graph edge "${edge._id}" from resource "${resourceName}": `
                                    + `"from"/"to" must reference a node in the same resource's own payload.`
                                );
                            }
                            return valid;
                        })
                        .map(edge => ({
                            ...edge,
                            resourceName,
                            compositeId: selection_edge_id(resourceName, edge._id),
                            from: selection_node_id(resourceName, edge.from),
                            to: selection_node_id(resourceName, edge.to)
                        }));
                });
            },

            // This board's default layout hint (doc's "Data"/"Layout"): a
            // resource is free to suggest its own; where several resources
            // share a board, a later-attached resource's fields win over an
            // earlier one's for the same key -- a minor, undesigned edge
            // case for the uncommon multi-resource-board case.
            payloadLayoutHint: (state, getters) =>
                Object.assign({}, ...Object.values(getters.dataByResource).map(data => data.layout ?? {}))
        },

        mutations: {
            // Recorded once per descent (see the state comment above) --
            // always overwrites (unlike the old owned-copy version's
            // once-only guard): staleness is judged at read time by the
            // `drillRoot` getter instead of being prevented at write time,
            // so a second descent for the same resource before backing out
            // of the first correctly replaces the remembered root rather
            // than being silently ignored.
            set_drill_root(state, {resourceName, rootItemId, drilledItemId}) {
                state.drillRootByResource = {...state.drillRootByResource, [resourceName]: {rootItemId, drilledItemId}};
            }
        }
    };
}
