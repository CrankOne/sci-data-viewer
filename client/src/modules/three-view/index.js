// Registers the 3D geometry viewer as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "geo3d" data type known to the app -- see main.js.

import { register_module } from '../registry';

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

register_module({
    dataType: 'geo3d',
    label: '3D Geometry',
    viewportComponent: ThreeViewport,
    sidePanelSections: [
        {id: 'geo3d:items-tree', title: 'Items', component: ItemsTree},
        // Deliberately separate from the Items Tree: a scene can carry many
        // thousands of individual point markers, so this panel only ever
        // lists the (expected-small) current selection rather than every
        // marker -- see the design discussion that led to per-marker
        // picking (three/index.js's _toggle_marker_selection).
        {id: 'geo3d:selected-markers', title: 'Selected markers', component: SelectedMarkersPanel},
        {id: 'geo3d:transf-groups', title: 'Transformation groups', component: TransfGroupsPanel},
        {id: 'geo3d:scene-helpers', title: 'Scene Helpers', component: SceneHelpers}
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
    // Same {mutation, payload} shape connection.js's RESOURCE_TYPE_HANDLERS
    // used to hardcode -- now owned by the module instead of by core.
    // A function of the resource's contextId, since view3D is registered
    // per-context rather than under one fixed namespace.
    payloadMutation: contextId => `view3D_${contextId}/update_geo_data`,
    payload(resource, data) {
        return {name: resource.name, geoData: data};
    },
    // Mirrors payloadMutation/payload, for dropping a resource's data from
    // a context it's leaving (removed, or reassigned to a different scene --
    // see connection.js's remove_resource/reassign_resource_context).
    removeMutation: contextId => `view3D_${contextId}/remove_geo_data`,
    removePayload(resource) {
        return resource.name;
    },
    installPersistence(store, sessionId) {
        install_camera_preset_persistence(store, sessionId);
    }
});
