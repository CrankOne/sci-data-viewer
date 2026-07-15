const STORAGE_KEY = "viewer.facet-presets.v1";

function readStoredPresets() {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);

    if (!text)
      return null;

    const parsed = JSON.parse(text);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.presets !== "object"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(
      "Could not read facet presets from local storage:",
      error
    );

    return null;
  }
}

function writeStoredPresets(state) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        presets: state.facetPresets,
        activePresetName: state.activeFacetPresetName
      })
    );
  } catch (error) {
    console.warn(
      "Could not save facet presets to local storage:",
      error
    );
  }
}

export function installFacetPresetPersistence(store) {
  const stored = readStoredPresets();

  if (stored) {
    store.commit(
      "view3D/initialize_facet_presets",
      stored
    );
  }

  store.subscribe((mutation, rootState) => {
    if (!mutation.type.startsWith("view3D/"))
      return;

    const persistentMutations = new Set([
      "view3D/initialize_facet_presets",
      "view3D/activate_facet_preset",
      "view3D/set_active_facet_preset_facets",
      "view3D/save_facet_preset",
      "view3D/delete_facet_preset"
    ]);

    if (!persistentMutations.has(mutation.type))
      return;

    writeStoredPresets(rootState.view3D);
  });
}
