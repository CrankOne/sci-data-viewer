import { install_persistence } from '@/store/persistence';

export function install_selection_set_persistence(store) {
    install_persistence(store, {
        storageKey: "viewer.selection-sets.v1",
        requiredKey: "sets",
        initMutation: "view3D/initialize_selection_sets",
        persistMutations: [
            "view3D/initialize_selection_sets",
            "view3D/activate_selection_set",
            "view3D/save_selection_set",
            "view3D/update_active_selection_set",
            "view3D/delete_selection_set"
        ],
        serialize(rootState) {
            return {sets: rootState.view3D.selectionSets};
        }
    });
}
