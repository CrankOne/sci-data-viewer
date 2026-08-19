// The one sanctioned path for routing something out of an origin context
// into whatever context its sinkTargets[targetDataType] points at (doc/
// ui-session.rst's "Extension points", the cross-module "selection sink"
// mechanism) -- mirrors sceneCreation.js's role as the single sanctioned
// path for creating a scene. Two flavors today, sharing delivery
// (deliver_to_sink() below) but not payload-building: send_selection_to_sink
// (geo3d's current selection) and send_table_projection_to_sink
// (doc/module-table.rst's "Plot dispatch", a column projection -- not a
// selection at all, despite going through the same mechanism).
//
// Manual, one-shot dispatch: calling either snapshots/builds its payload
// and sends it once. Neither subscribes to future changes -- sinkTargets
// only makes *where a future click goes* durable across reloads, not an
// automatic resend on every change (a separable, larger follow-up if ever
// wanted).
import { get_module } from '@/modules/registry';
import { destruct_geo_id } from '@/modules/three-view/utils';
import { destruct_selection_id } from '@/modules/graph/ids';

// Builds a self-contained snapshot of the given context's current geo3d
// selection: a reference (itemId + srcID, both recovered accurately from
// the existing `geoID@srcID` composite id -- see full_geo_id/destruct_geo_id,
// modules/three-view/utils.js) plus whatever geometry data is already
// loaded, no live re-fetch. geo3d-specific -- the first real sink origin;
// a second origin type's own snapshot builder would live alongside this,
// not inside contexts.js or the registry.
function build_geo_selection_snapshot(store, originContextId) {
    const view3DNS = `view3D_${originContextId}`;
    // Generic per-context selection state (doc/ui-session.rst's "Selection
    // model", store/selection.js) -- separate from view3DNS above, which
    // only holds geo3d's own geometry cache.
    const selectionNS = `selection_${originContextId}`;
    const selectedIds = store.getters[`${selectionNS}/selectedItemIDs`];
    const geoData = store.getters[`${view3DNS}/geoData`]; // {[srcID]: {materials, geometry}} -- view3D.js's own getter

    return [...selectedIds].map(fullId => {
        const [srcID, itemId] = destruct_geo_id(fullId);
        const geometry = geoData[srcID]?.geometry?.find(item => item._name === itemId) ?? null;
        return {itemId, srcID, snapshot: geometry};
    });
}

// The part every dispatch flavor shares, regardless of how `items` was
// built: resolve the origin's sinkTargets pointer, confirm the target
// module actually opted into receiving (registry.js's receiveSinkMutation),
// and commit. Pulled out once a second flavor -- modules/table/'s plot
// column-projection dispatch, below -- needed the identical delivery step
// with a different (non-selection) payload.
function deliver_to_sink(store, {originContextId, targetDataType, type, items}) {
    const origin = store.getters['contexts/context'](originContextId);
    const targetContextId = origin?.sinkTargets?.[targetDataType];
    if(!targetContextId) {
        throw new Error(`No sink target of type "${targetDataType}" set for context "${originContextId}"`);
    }

    const targetModule = get_module(targetDataType);
    if(!targetModule?.receiveSinkMutation) {
        throw new Error(`Data type "${targetDataType}" cannot receive sink items`);
    }

    const mutation = typeof targetModule.receiveSinkMutation === 'function'
        ? targetModule.receiveSinkMutation(targetContextId)
        : targetModule.receiveSinkMutation;

    store.commit(mutation, {originContextId, type, items}, {root: true});
}

export function send_selection_to_sink(store, {originContextId, targetDataType}) {
    const items = build_geo_selection_snapshot(store, originContextId);
    deliver_to_sink(store, {originContextId, targetDataType, type: 'geo3d', items});
}

// doc/module-table.rst's "Plot dispatch": a *different* thing from
// "Selection sinks" above despite sharing the delivery mechanism -- this
// carries a column projection (x/y values across the currently loaded
// rows), not "the current selection". `items` is built by the caller
// (modules/table/TableViewport.vue), since what counts as a projection is
// entirely this module's own concern, not sinkDispatch's. The target
// (:doc:`module-plotter`) declares no `receiveSinkMutation` yet, so this
// reaches, and stops at, the same "cannot receive" error
// deliver_to_sink() already gives any other unready target -- an honest
// failure, not a faked round trip (doc/ui-session.rst's "Selection sinks":
// "the plotter as a sink origin... needs [a selection model] designed
// first" -- receiving is the same kind of not-yet-done).
export function send_table_projection_to_sink(store, {originContextId, targetDataType, items}) {
    deliver_to_sink(store, {originContextId, targetDataType, type: 'table-projection', items});
}

// doc/module-graph.rst's "Selection and forwarding": a second sink
// *origin* type, alongside geo3d above -- this module's board keeps its
// raw, per-resource node/edge data (store/graphBoard.js's own
// dataByResource, not the merged/composite-id'd getters DiagramViewport.vue
// itself reads) accessed directly via the dynamically-registered module's
// state, the same way build_geo_selection_snapshot above reads view3D's.
// A selected id is this module's own `node:<resource>::<id>`/
// `edge:<resource>::<id>` composite (modules/graph/ids.js), which already
// carries everything needed to resolve back to the source item without a
// second addressing scheme.
function build_graph_selection_snapshot(store, originContextId) {
    const boardNS = `graphBoard_${originContextId}`;
    const selectionNS = `selection_${originContextId}`;
    const selectedIds = store.getters[`${selectionNS}/selectedItemIDs`];
    const dataByResource = store.state[boardNS]?.dataByResource ?? {};

    return [...selectedIds].map(compositeId => {
        const {kind, resourceName, localId} = destruct_selection_id(compositeId);
        const resource = dataByResource[resourceName];
        const collection = kind === 'node' ? resource?.nodes : resource?.edges;
        const item = collection?.find(entry => entry._id === localId) ?? null;
        return {itemId: localId, srcID: resourceName, snapshot: item && {...item, _kind: kind}};
    });
}

export function send_graph_selection_to_sink(store, {originContextId, targetDataType}) {
    const items = build_graph_selection_snapshot(store, originContextId);
    deliver_to_sink(store, {originContextId, targetDataType, type: 'graph', items});
}
