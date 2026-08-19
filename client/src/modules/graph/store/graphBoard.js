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
import { selection_node_id, selection_edge_id } from '../ids';

export function make_graph_board_module() {
    const keyed = make_keyed_collection({
        stateKey: 'dataByResource',
        setMutation: '_set_graph_data',
        removeMutation: 'remove_graph_data',
        normalizeValue: data => ({
            nodes: data?.nodes ?? [],
            edges: data?.edges ?? [],
            layout: data?.layout ?? null
        })
    });

    return {
        namespaced: true,

        state: keyed.state,

        getters: {
            ...keyed.getters,

            // Every resource's nodes, composite-id'd (ids.js) so several
            // sources sharing this board never collide (doc's "Boards").
            allNodes: state => Object.entries(state.dataByResource).flatMap(
                ([resourceName, data]) => data.nodes.map(node => ({
                    ...node,
                    resourceName,
                    compositeId: selection_node_id(resourceName, node._id)
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
            update_graph_data(state, {name, nodes, edges, layout}) {
                keyed.mutations._set_graph_data(state, {key: name, value: {nodes, edges, layout}});
            }
        }
    };
}
