// Registers the 3D geometry viewer as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "geo3d" data type known to the app -- see main.js.

import { register_module } from '../registry';
import { CATEGORY_COMMON_SCOPE, CATEGORY_SCENE_3D } from '@/modules/panelItems';

import ThreeViewport from './components/ThreeViewport.vue';
import SceneHelpers from './components/SceneHelpers.vue';
import TransfGroupsPanel from './components/TransfGroupsPanel.vue';
import ItemsTree from './components/ItemsTree';
import SelectedMarkersPanel from './components/SelectedMarkersPanel.vue';

import { make_view3D_module } from './store/view3D';
import cameras from './store/cameras';
import { make_transf_groups_module } from './store/transfGroups';
import { install_camera_preset_persistence } from './store/cameraPresetPersistence';
import { make_selection_module } from '@/store/selection';
import { destruct_geo_id } from './utils';

register_module({
    dataType: 'geo3d',
    label: '3D Geometry',
    scopeNoun: 'scene',
    viewportComponent: ThreeViewport,
    sidePanelSections: [
        // "Items"/"Selected markers" are filed under the generic "common
        // scope" category (see modules/panelItems.js) even though this is
        // their only implementation today -- both are meant to generalize
        // to any contextual module eventually, not stay geo3d-specific.
        {id: 'geo3d:items-tree', title: 'Items', component: ItemsTree, category: CATEGORY_COMMON_SCOPE},
        // Deliberately separate from the Items Tree: a scene can carry many
        // thousands of individual point markers, so this panel only ever
        // lists the (expected-small) current selection rather than every
        // marker -- see the design discussion that led to per-marker
        // picking (three/index.js's _toggle_marker_selection).
        {
            id: 'geo3d:selected-markers', title: 'Selected markers', component: SelectedMarkersPanel,
            category: CATEGORY_COMMON_SCOPE
        },
        {id: 'geo3d:transf-groups', title: 'Transformation groups', component: TransfGroupsPanel, category: CATEGORY_SCENE_3D},
        {id: 'geo3d:scene-helpers', title: 'Scene Helpers', component: SceneHelpers, category: CATEGORY_SCENE_3D}
    ],
    // `cameras` is a single statically-registered module whose internal
    // `viewports` dict is keyed dynamically by widget-instance id (see
    // store/cameras.js); `view3D`/`transfGroups`/`selection` are contextual
    // -- see below -- and registered dynamically per context instead, by
    // store/modules/contexts.js. `selection` (store/selection.js) is the
    // generic item-selection/facet-preset/selection-set state any
    // contextual module may register under that fixed name (doc/ui-session
    // .rst's "Selection model"); `view3D` keeps only what's geo3d-specific
    // (loaded geometry, raycast-hover behavior).
    storeModules: {cameras},
    contextual: true,
    contextStoreModules: {
        view3D: make_view3D_module,
        transfGroups: make_transf_groups_module,
        selection: make_selection_module
    },
    installPersistence(store, sessionId) {
        install_camera_preset_persistence(store, sessionId);
    },
    // Sink *origin* only (doc/ui-session.rst's "Selection sinks") -- geo3d
    // never declares receiveSinkMutation/acceptsPayloadTypes, so it isn't a
    // sink target. Every item is the one payload type this module ever
    // produces. `resolve_selected_item` below is the one place that knows
    // how to turn a composite geo id into current geometry -- shared by
    // buildSinkSnapshot (iterating the current selection) and
    // resolveSinkItem (looking up one item later, regardless of whether
    // it's still selected) so there's exactly one lookup to keep correct.
    buildSinkSnapshot(store, contextId) {
        const selectedIds = store.getters[`selection_${contextId}/selectedItemIDs`];
        return [...selectedIds].flatMap(fullId => resolve_selected_item(store, contextId, fullId) ?? []);
    },
    // `originRef` is the same composite geo id buildSinkSnapshot iterated --
    // opaque to every other module, only this one needs to decode it (doc/
    // ui-session.rst's "Selection sinks", modules/registry.js's
    // resolveSinkItem). Returns null once the item -- or the whole
    // context -- no longer exists, which is what makes a sink item stop
    // displaying itself when its origin goes away: nothing forwards a
    // stale copy, there's simply nothing left to resolve.
    resolveSinkItem(store, contextId, originRef) {
        return resolve_selected_item(store, contextId, originRef);
    }
});

function resolve_selected_item(store, contextId, fullId) {
    const geoData = store.getters[`view3D_${contextId}/geoData`]; // {[srcID]: {materials, geometry}}
    const [srcID, itemId] = destruct_geo_id(fullId);
    const geometry = geoData?.[srcID]?.geometry?.find(item => item._name === itemId);
    if(!geometry) return null;
    return {itemId, srcID, originRef: fullId, payloadType: 'geo-item', snapshot: geometry};
}
