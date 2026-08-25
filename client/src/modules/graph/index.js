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
    // this became a registry-declared, generically-dispatched function).
    //
    // `payloadType` names the type of whatever named sub-aspect of the
    // item's own ``subjectData`` matches a known sink-item type -- today
    // just `plot` (``subjectData.plot``, shaped like this module's own
    // plotData envelope per doc/module-graph.rst's "Subject data") -- never
    // the item's own structural role (node vs. edge) within this module. A
    // node and an edge carrying the same kind of subjectData forward
    // identically; the receiver (doc/ui-session.rst's "Selection sinks")
    // never learns which one it selected, only what's in the payload --
    // 'graph'-flavored tags like 'graph-node'/'graph-edge' would leak this
    // module's own internals into every receiver's acceptsPayloadTypes
    // list, which is exactly what the vocabulary is meant to avoid. An item
    // with no subjectData, or none of its recognized sub-aspects, yields
    // nothing -- there's nothing typed to forward.
    //
    // `_kind` (node/edge) rides along on the forwarded snapshot rather than
    // driving payloadType -- a link's facetsSelector can still discriminate
    // on it (e.g. `{_kind: 'node'}`) if a receiver only wants one of the two.
    //
    // `resolve_selected_item` below is the one place that knows how to turn
    // a composite selection id into current node/edge data -- shared by
    // buildSinkSnapshot (iterating the current selection) and
    // resolveSinkItem (looking up one item later, regardless of whether
    // it's still selected) so there's exactly one lookup to keep correct.
    buildSinkSnapshot(store, contextId) {
        const selectedIds = store.getters[`selection_${contextId}/selectedItemIDs`];
        return [...selectedIds].flatMap(compositeId => resolve_selected_item(store, contextId, compositeId));
    },
    // `originRef` is the same composite selection id buildSinkSnapshot
    // iterated -- opaque to every other module, only this one needs to
    // decode it (doc/ui-session.rst's "Selection sinks", modules/registry
    // .js's resolveSinkItem). Returns null once the item -- or the whole
    // context -- no longer exists, which is what makes a sink item stop
    // displaying itself when its origin goes away: nothing forwards a
    // stale copy, there's simply nothing left to resolve.
    resolveSinkItem(store, contextId, originRef) {
        return resolve_selected_item(store, contextId, originRef)[0] ?? null;
    }
});

function resolve_selected_item(store, contextId, compositeId) {
    const {kind, resourceName, localId} = destruct_selection_id(compositeId);
    const dataByResource = store.getters[`graphBoard_${contextId}/dataByResource`] ?? {};
    const resource = dataByResource[resourceName];
    const collection = kind === 'node' ? resource?.nodes : resource?.edges;
    const item = collection?.find(entry => entry._id === localId);
    // `subjectData` is a grab-bag (doc/module-graph.rst's "Subject data"),
    // not itself the forwarded payload -- real payloads (na64umff's FSM
    // nodes) carry it as `{plot: {primitives: [...]}, parameters: [...],
    // createdByTransition: {...}, ...}`, only `plot` matching a known
    // sink-item type. Forwarding `subjectData` whole (an earlier version of
    // this function did) put `parameters`/`createdByTransition`/etc. in the
    // way of `snapshot.primitives`, which is what a 'plot'-typed receiver
    // actually reads -- silently empty, not an error.
    if(!item?.subjectData?.plot) return [];
    return [{
        itemId: localId, srcID: resourceName, originRef: compositeId,
        payloadType: 'plot',
        snapshot: {...item.subjectData.plot, _facets: item._facets, _kind: kind}
    }];
}
