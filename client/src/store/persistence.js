// Generic localStorage-backed persistence for a Vuex store slice: on
// install, seeds the store from whatever was previously saved (if any) via
// `initMutation`, then re-saves (via `serialize`) whenever one of
// `persistMutations` commits. Used by any module that wants a piece of its
// state (presets, saved selections, settings, ...) to survive a reload --
// see modules/three-view/store/*Persistence.js for concrete examples.
export function install_persistence(store, {storageKey, requiredKey, initMutation, persistMutations, serialize}) {
    const stored = read_stored(storageKey, requiredKey);
    if(stored) store.commit(initMutation, stored);

    const persistentMutations = new Set(persistMutations);
    store.subscribe((mutation, rootState) => {
        if(!persistentMutations.has(mutation.type)) return;
        write_stored(storageKey, serialize(rootState));
    });
}

function read_stored(storageKey, requiredKey) {
    try {
        const text = localStorage.getItem(storageKey);
        if(!text) return null;

        const value = JSON.parse(text);
        if(!value || typeof value !== "object" || typeof value[requiredKey] !== "object")
            return null;

        return value;
    } catch(error) {
        console.warn(`Could not read persisted state for "${storageKey}":`, error);
        return null;
    }
}

function write_stored(storageKey, value) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(value));
    } catch(error) {
        console.warn(`Could not persist state for "${storageKey}":`, error);
    }
}
