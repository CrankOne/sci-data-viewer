// Per-context "board" state (doc/module-graph.rst's "Boards"): one merged
// node/edge store shared by every data source attached to this board --
// registered as this module's own contextStoreModules entry
// (modules/graph/index.js), the same generic per-context mechanism any
// contextual viewer module uses (doc/ui-session.rst's "Extension points").
//
// A board does not diff/sync items by identity: like modules/plotter's
// desk, a resource's nodes/edges are simply replaced wholesale on every
// update, keyed by resource name so several sources can share one board
// without colliding (store/keyedCollection.js, the same factory
// plotDesk.js/sinkInbox.js already share).
import { make_keyed_collection } from '@/store/keyedCollection';
import { selection_node_id, selection_edge_id, selection_cluster_id } from '../ids';

export function make_graph_board_module() {
    const keyed = make_keyed_collection({
        stateKey: 'dataByResource',
        setMutation: '_set_graph_data',
        removeMutation: '_remove_graph_data',
        normalizeValue: data => ({
            nodes: data?.nodes ?? [],
            edges: data?.edges ?? [],
            layout: data?.layout ?? null,
            // Drill-down targets (doc/module-graph.rst's "Nested graphs"):
            // other addressable items of this same resource rendering a
            // structurally-nested sub-graph this payload's own nodes/edges
            // omit (e.g. na64umff's per-domain breakdown sub-fits). Opaque
            // {itemId, path, label} list, never interpreted beyond that.
            nestedGraphs: data?.nestedGraphs ?? [],
            // Named regions (doc/module-graph.rst's "Clusters") a node may
            // declare membership in via its own `cluster` field -- e.g.
            // na64umff's per-domain breakdown sub-fits, one cluster per
            // domain. Rendered, not interactive (see allClusters below).
            clusters: data?.clusters ?? []
        })
    });

    return {
        namespaced: true,

        state: () => ({
            ...keyed.state(),
            // One remembered ancestor itemId per resource -- the item to
            // return to when the user backs out of a drill-down (see
            // "Nested graphs" above). Exactly one level deep: a source is
            // expected to never advertise nestedGraphs on an already-
            // drilled-into item (na64umff.py's own drill-down responses
            // never set it), so there is nothing to push/pop -- "the top" is
            // always the single ancestor recorded here.
            drillRootByResource: {}
        }),

        getters: {
            ...keyed.getters,

            // Every resource's advertised drill-down targets, tagged with
            // the resource they belong to -- needed to know which resource
            // to re-fetch when one is picked (NestedGraphsPanel.vue).
            allNestedGraphs: state => Object.entries(state.dataByResource).flatMap(
                ([resourceName, data]) => (data.nestedGraphs ?? []).map(entry => ({...entry, resourceName}))
            ),

            // The itemId to return to for `resourceName`, or null when not
            // currently drilled into anything.
            drillRoot: state => resourceName => state.drillRootByResource[resourceName] ?? null,

            // Every resource's nodes, composite-id'd (ids.js) so several
            // sources sharing this board never collide (doc's "Boards"). A
            // node's own `cluster` field (a local cluster id) is rewritten
            // to that cluster's composite id the same way an edge's
            // `from`/`to` already is below (doc's "Clusters").
            allNodes: state => Object.entries(state.dataByResource).flatMap(
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
            allClusters: state => Object.entries(state.dataByResource).flatMap(
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
            allEdges: state => {
                const localNodeIdsByResource = new Map(
                    Object.entries(state.dataByResource).map(
                        ([resourceName, data]) => [resourceName, new Set(data.nodes.map(node => node._id))]
                    )
                );

                return Object.entries(state.dataByResource).flatMap(([resourceName, data]) => {
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
            payloadLayoutHint: state =>
                Object.assign({}, ...Object.values(state.dataByResource).map(data => data.layout ?? {}))
        },

        mutations: {
            ...keyed.mutations,
            // Wraps the factory's {key, value} shape under the external
            // mutation name payloadMutation (modules/graph/index.js)
            // already commits to by string.
            update_graph_data(state, {name, nodes, edges, layout, nestedGraphs, clusters}) {
                keyed.mutations._set_graph_data(state, {key: name, value: {nodes, edges, layout, nestedGraphs, clusters}});
                // A payload carrying its own nestedGraphs is, by the "Nested
                // graphs" contract above, never itself a drilled-into item --
                // so any ancestor previously remembered for this resource is
                // stale the moment one arrives, whether that's the user's
                // own "Back" landing on it or a fresh top-level item picked
                // outright while mid-drill (NestedGraphsPanel.vue never
                // needs to clear this itself, see drill_back there).
                if((nestedGraphs ?? []).length && Object.hasOwn(state.drillRootByResource, name)) {
                    const next = {...state.drillRootByResource};
                    delete next[name];
                    state.drillRootByResource = next;
                }
            },
            // Wraps the factory's own remove mutation the same way, so a
            // resource leaving the board also drops its drill ancestor
            // rather than leaving it to collide with a same-named resource
            // added later.
            remove_graph_data(state, name) {
                keyed.mutations._remove_graph_data(state, name);
                if(Object.hasOwn(state.drillRootByResource, name)) {
                    const next = {...state.drillRootByResource};
                    delete next[name];
                    state.drillRootByResource = next;
                }
            },
            // Recorded once per descent (see the "one level deep" getter
            // comment above) -- a second call for the same resource before
            // the first is cleared is a no-op, so drilling into a sibling
            // nested graph without backing out first still returns to the
            // original top-level item, not the one just left.
            set_drill_root(state, {resourceName, itemId}) {
                if(Object.hasOwn(state.drillRootByResource, resourceName)) return;
                state.drillRootByResource = {...state.drillRootByResource, [resourceName]: itemId};
            }
        }
    };
}
