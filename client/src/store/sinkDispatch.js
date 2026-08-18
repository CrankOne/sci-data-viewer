// The one sanctioned path for routing an origin context's current
// selection into whatever context its sinkTargets[targetDataType] points
// at (doc/ui-session.rst's "Extension points", the cross-module "selection
// sink" mechanism) -- mirrors sceneCreation.js's role as the single
// sanctioned path for creating a scene.
//
// Manual, one-shot dispatch: calling this snapshots the *current* selection
// and sends it once. It does not subscribe to future selection changes --
// sinkTargets only makes *where a future click goes* durable across
// reloads, not an automatic resend on every change (a separable, larger
// follow-up if ever wanted).
import { get_module } from '@/modules/registry';
import { destruct_geo_id } from '@/modules/three-view/utils';

// Builds a self-contained snapshot of the given context's current geo3d
// selection: a reference (itemId + srcID, both recovered accurately from
// the existing `geoID@srcID` composite id -- see full_geo_id/destruct_geo_id,
// modules/three-view/utils.js) plus whatever geometry data is already
// loaded, no live re-fetch. geo3d-specific -- the first real sink origin;
// a second origin type's own snapshot builder would live alongside this,
// not inside contexts.js or the registry.
function build_geo_selection_snapshot(store, originContextId) {
    const ns = `view3D_${originContextId}`;
    const selectedIds = store.getters[`${ns}/selectedGeoItemIDs`];
    const geoData = store.getters[`${ns}/geoData`]; // {[srcID]: {materials, geometry}} -- view3D.js's own getter

    return [...selectedIds].map(fullId => {
        const [srcID, itemId] = destruct_geo_id(fullId);
        const geometry = geoData[srcID]?.geometry?.find(item => item._name === itemId) ?? null;
        return {itemId, srcID, snapshot: geometry};
    });
}

export function send_selection_to_sink(store, {originContextId, targetDataType}) {
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

    const items = build_geo_selection_snapshot(store, originContextId);
    store.commit(mutation, {originContextId, type: 'geo3d', items}, {root: true});
}
