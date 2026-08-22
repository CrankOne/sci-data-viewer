// Registers the block diagram module as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "graph" data type known to the app -- see main.js.

import { register_module } from '../registry';
import { CATEGORY_APP, CATEGORY_COMMON_SCOPE } from '@/modules/panelItems';

import DiagramViewport from './DiagramViewport.vue';
import GraphSinkPanel from './GraphSinkPanel.vue';
import NestedGraphsPanel from './NestedGraphsPanel.vue';

import { make_graph_board_module } from './store/graphBoard';
import graphLayout from './store/graphLayout';
import { install_graph_layout_persistence } from './store/graphLayoutPersistence';
import { make_sink_inbox_module } from '@/store/sinkInbox';
import { make_selection_module } from '@/store/selection';
import { destruct_selection_id } from './ids';

register_module({
    dataType: 'graph',
    label: 'Block Diagram',
    viewportComponent: DiagramViewport,
    sidePanelSections: [
        // Filed under the generic "application subpanels" category (see
        // modules/panelItems.js) alongside Data Sources/Application
        // Controls, despite being module-owned -- conceptually app-level
        // plumbing rather than tied to this scope's own content.
        {id: 'graph:sink-inbox', title: 'Sink inbox', component: GraphSinkPanel, category: CATEGORY_APP},
        // Content-navigation, not app plumbing -- CATEGORY_COMMON_SCOPE,
        // the same category three-view's own "Items" tree uses (doc/module-
        // graph.rst's "Nested graphs").
        {id: 'graph:nested-graphs', title: 'Nested procedures', component: NestedGraphsPanel, category: CATEGORY_COMMON_SCOPE}
    ],
    // `graphLayout` is a single statically-registered module whose internal
    // `byViewport` dict is keyed dynamically by widget-instance id (see
    // store/graphLayout.js) -- mirrors three-view's own `cameras`
    // (doc/module-graph.rst's "Diagrams"). `graphBoard`/`sinkInbox`/
    // `selection` are contextual -- see below -- registered dynamically per
    // context instead, by store/modules/contexts.js.
    storeModules: {graphLayout},
    contextual: true,
    contextStoreModules: {
        graphBoard: make_graph_board_module,
        // The "Selection view"-equivalent use case (doc's "Selection and
        // forwarding"): this module is a real sink *target*, the same
        // mechanism modules/sink-view/'s dev stub proves in isolation and
        // modules/table/ uses for real, sharing the same factory
        // (store/sinkInbox.js) rather than a second copy.
        sinkInbox: make_sink_inbox_module,
        // Generic per-context item-selection state (doc/ui-session.rst's
        // "Selection model") -- node/edge composite ids (ids.js) are just
        // strings to this module, so no graph-specific selection code is
        // needed here.
        selection: make_selection_module
    },
    // Same {mutation, payload} shape connection.js's RESOURCE_TYPE_HANDLERS
    // used to hardcode -- now owned by the module instead of by core. A
    // function of the resource's contextId, since graphBoard is registered
    // per-context rather than under one fixed namespace.
    payloadMutation: contextId => `graphBoard_${contextId}/update_graph_data`,
    payload(resource, data) {
        // `data` is the raw fetched body -- doc/module-graph.rst's
        // "graphData" envelope ({layout, nodes, edges, nestedGraphs, clusters}).
        const graph = data?.graphData ?? null;
        return {
            name: resource.name,
            nodes: graph?.nodes ?? [],
            edges: graph?.edges ?? [],
            layout: graph?.layout ?? null,
            nestedGraphs: graph?.nestedGraphs ?? [],
            clusters: graph?.clusters ?? []
        };
    },
    // Mirrors payloadMutation/payload, for dropping a resource's data from
    // a context it's leaving (removed, or reassigned to a different board --
    // see connection.js's remove_resource/reassign_resource_context).
    removeMutation: contextId => `graphBoard_${contextId}/remove_graph_data`,
    removePayload(resource) {
        return resource.name;
    },
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    // Doesn't discriminate what it receives -- GraphSinkPanel.vue lists
    // whatever lands, same as modules/sink-view/'s dev stub (doc/module-
    // graph.rst's "Selection and forwarding" has no shape requirement of
    // its own for incoming items).
    acceptsPayloadTypes: '*',
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`,
    installPersistence(store, sessionId) {
        install_graph_layout_persistence(store, sessionId);
    },
    // Sink *origin* (doc/module-graph.rst's "Selection and forwarding"):
    // reads this board's own raw per-resource node/edge data
    // (store/graphBoard.js's dataByResource, not DiagramViewport.vue's own
    // merged/composite-id'd getters) the same way
    // build_graph_selection_snapshot used to (store/sinkDispatch.js, before
    // this became a registry-declared, generically-dispatched function). A
    // selection can mix nodes and edges, so unlike three-view's single
    // 'geo-item' type, each item is tagged with its own kind here.
    buildSinkSnapshot(store, contextId) {
        const boardNS = `graphBoard_${contextId}`;
        const selectionNS = `selection_${contextId}`;
        const selectedIds = store.getters[`${selectionNS}/selectedItemIDs`];
        const dataByResource = store.state[boardNS]?.dataByResource ?? {};

        return [...selectedIds].map(compositeId => {
            const {kind, resourceName, localId} = destruct_selection_id(compositeId);
            const resource = dataByResource[resourceName];
            const collection = kind === 'node' ? resource?.nodes : resource?.edges;
            const item = collection?.find(entry => entry._id === localId) ?? null;
            return {
                itemId: localId, srcID: resourceName,
                payloadType: kind === 'node' ? 'graph-node' : 'graph-edge',
                snapshot: item && {...item, _kind: kind}
            };
        });
    }
});
