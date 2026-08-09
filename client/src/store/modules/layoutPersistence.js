import { install_persistence } from '@/store/persistence';

export function install_layout_persistence(store) {
    install_persistence(store, {
        storageKey: 'viewer.layout.v1',
        requiredKey: 'root',
        initMutation: 'layout/set_root',
        persistMutations: [
            'layout/set_root',
            'layout/split_panel',
            'layout/remove_panel',
            'layout/move_item',
            'layout/move_module',
            'layout/set_ratio'
        ],
        serialize(rootState) {
            return {root: rootState.layout.root};
        }
    });
}
