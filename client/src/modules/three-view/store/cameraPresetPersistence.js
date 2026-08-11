import { install_persistence } from '@/store/persistence';

// `sessionId` scopes this to one saved session (see
// store/modules/session.js) -- each session gets its own independent
// camera presets.
export function install_camera_preset_persistence(store, sessionId) {
    install_persistence(store, {
        storageKey: `viewer.camera-presets.v1.${sessionId}`,
        requiredKey: "presets",
        initMutation: "cameras/initialize_presets",
        // NOTE: deliberately excludes "cameras/resize_viewport" -- viewport
        // width/height/aspect are runtime layout state, not part of a preset.
        persistMutations: [
            "cameras/initialize_presets",
            "cameras/set_current_preset",
            "cameras/replace_preset",
            "cameras/patch_preset",
            "cameras/patch_working_camera",
            "cameras/remove_preset"
        ],
        serialize(rootState) {
            const currentPresetByViewport = Object.fromEntries(
                Object.entries(rootState.cameras.viewports).map(([viewportID, viewport]) => [viewportID, viewport.currentPreset])
            );
            return {presets: rootState.cameras.presets, currentPresetByViewport};
        }
    });
}
