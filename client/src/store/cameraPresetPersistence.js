const STORAGE_KEY = "viewer.camera-presets.v1";

function readStoredPresets() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);

    if (!text)
      return null;

    const value = JSON.parse(text);

    if (
      !value ||
      typeof value !== "object" ||
      typeof value.presets !== "object"
    ) {
      return null;
    }

    return value;
  } catch (error) {
    console.warn(
      "Could not read saved camera presets:",
      error
    );

    return null;
  }
}

function writeStoredPresets(state) {
  try {
    const currentPresetByViewport = Object.fromEntries(
      Object.entries(state.viewports).map(([viewportID, viewport]) => [
        viewportID,
        viewport.currentPreset
      ])
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        presets: state.presets,
        currentPresetByViewport
      })
    );
  } catch (error) {
    console.warn(
      "Could not persist camera presets:",
      error
    );
  }
}

export function installCameraPresetPersistence(store) {
  const stored = readStoredPresets();

  if (stored) {
    store.commit(
      "cameras/initialize_presets",
      stored
    );
  }

  // NOTE: deliberately excludes "cameras/resize_viewport" -- viewport
  // width/height/aspect are runtime layout state, not part of a preset.
  const persistentMutations = new Set([
    "cameras/initialize_presets",
    "cameras/set_current_preset",
    "cameras/replace_preset",
    "cameras/patch_preset",
    "cameras/patch_working_camera",
    "cameras/remove_preset"
  ]);

  store.subscribe((mutation, rootState) => {
    if (!persistentMutations.has(mutation.type))
      return;

    writeStoredPresets(rootState.cameras);
  });
}
