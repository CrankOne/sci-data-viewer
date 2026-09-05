// Session-scoped persistence for the `transforms` store module -- one
// singleton slice per session (like store/modules/layoutPersistence.js's
// layout tree), not per-context like store/modules/contexts.js's own
// sinkLinks persistence: a transform and its feeds are session-global
// entities on the wiring diagram, not owned by any one scope.
import { install_persistence } from '@/store/persistence';

const STORAGE_KEY_BASE = 'viewer.transforms.v1';

export function install_transforms_persistence(store, sessionId) {
    install_persistence(store, {
        storageKey: `${STORAGE_KEY_BASE}.${sessionId}`,
        sessionId,
        requiredKey: 'byId',
        initMutation: 'transforms/initialize_transforms',
        persistMutations: [
            'transforms/add_transform', 'transforms/remove_transform', 'transforms/rename_transform',
            'transforms/set_transform_source', 'transforms/set_transform_enabled',
            'transforms/add_feed', 'transforms/remove_feed',
            'transforms/add_output_link', 'transforms/remove_output_link'
        ],
        serialize(rootState) {
            const {byId, order, feeds} = rootState.transforms;
            return {byId, order, feeds};
        }
    });
}
