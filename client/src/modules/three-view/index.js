// Registers the 3D geometry viewer as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "geo3d" data type known to the app -- see main.js.

import { register_module } from '../registry';

import ThreeViewport from './components/ThreeViewport.vue';
import SceneHelpers from './components/SceneHelpers.vue';
import TransfGroupsPanel from './components/TransfGroupsPanel.vue';
import ItemsTree from './components/ItemsTree';

import view3D from './store/view3D';
import cameras from './store/cameras';
import transfGroups from './store/transfGroups';
import { install_camera_preset_persistence } from './store/cameraPresetPersistence';
import { install_facet_preset_persistence } from './store/facetPresetPersistence';
import { install_selection_set_persistence } from './store/selectionSetPersistence';

register_module({
    dataType: 'geo3d',
    label: '3D Geometry',
    viewportComponent: ThreeViewport,
    sidePanelSections: [
        {id: 'geo3d:items-tree', title: 'Items', component: ItemsTree},
        {id: 'geo3d:transf-groups', title: 'Transformation groups', component: TransfGroupsPanel},
        {id: 'geo3d:scene-helpers', title: 'Scene Helpers', component: SceneHelpers}
    ],
    storeModules: {view3D, cameras, transfGroups},
    // Same {mutation, payload} shape connection.js's RESOURCE_TYPE_HANDLERS
    // used to hardcode -- now owned by the module instead of by core.
    payloadMutation: 'view3D/update_geo_data',
    payload(resource, data) {
        return {name: resource.name, geoData: data};
    },
    installPersistence(store) {
        install_camera_preset_persistence(store);
        install_facet_preset_persistence(store);
        install_selection_set_persistence(store);
    }
});
