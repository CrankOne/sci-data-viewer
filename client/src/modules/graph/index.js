// Registers the block diagram module as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "graph" data type known to the app -- see main.js.

import { register_module } from '../registry';

import DiagramViewport from './DiagramViewport.vue';
import GraphSinkPanel from './GraphSinkPanel.vue';

import { make_graph_board_module } from './store/graphBoard';
import graphLayout from './store/graphLayout';
import { install_graph_layout_persistence } from './store/graphLayoutPersistence';
import { make_sink_inbox_module } from '@/store/sinkInbox';
import { make_selection_module } from '@/store/selection';

register_module({
    dataType: 'graph',
    label: 'Block Diagram',
    viewportComponent: DiagramViewport,
    sidePanelSections: [
        {id: 'graph:sink-inbox', title: 'Sink inbox', component: GraphSinkPanel}
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
        // "graphData" envelope ({layout, nodes, edges}).
        const graph = data?.graphData ?? null;
        return {
            name: resource.name,
            nodes: graph?.nodes ?? [],
            edges: graph?.edges ?? [],
            layout: graph?.layout ?? null
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
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`,
    installPersistence(store, sessionId) {
        install_graph_layout_persistence(store, sessionId);
    }
});
