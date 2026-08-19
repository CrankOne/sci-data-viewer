import { install_persistence } from '@/store/persistence';

// `sessionId` scopes this to one saved session (see store/modules/session.js)
// -- each session gets its own independent per-diagram layout options.
// Mirrors modules/three-view/store/cameraPresetPersistence.js exactly, one
// storage key simpler (no named-preset indirection -- see graphLayout.js's
// header comment).
export function install_graph_layout_persistence(store, sessionId) {
    install_persistence(store, {
        storageKey: `viewer.graph-layout.v1.${sessionId}`,
        sessionId,
        requiredKey: 'byViewport',
        initMutation: 'graphLayout/initialize_layout_options',
        persistMutations: [
            'graphLayout/initialize_layout_options',
            'graphLayout/set_layout_options',
            'graphLayout/unregister_viewport'
        ],
        serialize(rootState) {
            return {byViewport: rootState.graphLayout.byViewport};
        }
    });
}
