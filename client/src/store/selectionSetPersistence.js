const STORAGE_KEY = "viewer.selection-sets.v1";

function readSelectionSets() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);

    if (!text)
      return null;

    const value = JSON.parse(text);

    if (
      !value ||
      typeof value !== "object" ||
      typeof value.sets !== "object"
    ) {
      return null;
    }

    return value;
  } catch (error) {
    console.warn(
      "Could not read saved selection sets:",
      error
    );

    return null;
  }
}

function writeSelectionSets(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sets: state.selectionSets,
        activeSetName: state.activeSelectionSetName
      })
    );
  } catch (error) {
    console.warn(
      "Could not persist selection sets:",
      error
    );
  }
}

export function installSelectionSetPersistence(store) {
  const stored = readSelectionSets();

  if (stored) {
    store.commit(
      "view3D/initialize_selection_sets",
      stored
    );
  }

  const persistentMutations = new Set([
    "view3D/initialize_selection_sets",
    "view3D/activate_selection_set",
    "view3D/save_selection_set",
    "view3D/update_active_selection_set",
    "view3D/delete_selection_set"
  ]);

  store.subscribe((mutation, rootState) => {
    if (!persistentMutations.has(mutation.type))
      return;

    writeSelectionSets(rootState.view3D);
  });
}
