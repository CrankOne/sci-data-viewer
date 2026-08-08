import { install_persistence } from '@/store/persistence';

export function install_facet_preset_persistence(store) {
    install_persistence(store, {
        storageKey: "viewer.facet-presets.v1",
        requiredKey: "presets",
        initMutation: "view3D/initialize_facet_presets",
        persistMutations: [
            "view3D/initialize_facet_presets",
            "view3D/activate_facet_preset",
            "view3D/set_active_facet_preset_facets",
            "view3D/save_facet_preset",
            "view3D/delete_facet_preset"
        ],
        serialize(rootState) {
            return {presets: rootState.view3D.facetPresets, activePresetName: rootState.view3D.activeFacetPresetName};
        }
    });
}
