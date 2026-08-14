// Generic localStorage-backed persistence for a Vuex store slice: on
// install, seeds the store from whatever was previously saved (if any) via
// `initMutation`, then re-saves (via `serialize`) whenever one of
// `persistMutations` commits. Used by any module that wants a piece of its
// state (presets, saved selections, settings, ...) to survive a reload --
// see modules/three-view/store/*Persistence.js for concrete examples.
//
// `sessionId`, when given, registers `storageKey` under that session's key
// manifest (see register_session_key below) -- pass it whenever the key is
// scoped to one saved session (store/modules/session.js), which is every
// current caller. Omit (or pass null) only for state that isn't
// session-scoped at all.
export function install_persistence(store, {storageKey, requiredKey, initMutation, persistMutations, serialize, sessionId = null}) {
    register_session_key(sessionId, storageKey);

    const stored = read_stored(storageKey, requiredKey);
    if(stored) store.commit(initMutation, stored);

    const persistentMutations = new Set(persistMutations);
    store.subscribe((mutation, rootState) => {
        if(!persistentMutations.has(mutation.type)) return;
        write_stored(storageKey, serialize(rootState));
    });
}

export function read_stored(storageKey, requiredKey) {
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

export function write_stored(storageKey, value) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(value));
    } catch(error) {
        console.warn(`Could not persist state for "${storageKey}":`, error);
    }
}

//                          * * *   * * *   * * *
// Session key manifest
//
// Every piece of state scoped to one saved session (layout, camera presets,
// facet presets, selection sets, data sources -- see store/modules/session.js)
// lives under its own localStorage key, named independently by whichever
// module owns it. Nothing used to record *which* keys belong to a given
// session: store/modules/session.js's remove_session had to hardcode a
// fixed-prefix list and explicitly give up on the per-context facet-preset/
// selection-set keys ("accepted, bounded leak"). This manifest -- itself
// just another localStorage entry -- closes that gap: every persistence
// installer registers its own key here, so a session's *complete* key list
// can be enumerated later (removal, export -- see sessionExport.js) without
// each caller re-deriving the naming scheme.

const SESSION_KEYS_PREFIX = 'viewer.session-keys.v1';

function session_keys_storage_key(sessionId) {
    return `${SESSION_KEYS_PREFIX}.${sessionId}`;
}

// Idempotent: registering the same (sessionId, storageKey) pair twice (e.g.
// a context re-registering its persistence across a session restore) is a
// no-op. A falsy `sessionId` is silently ignored -- some persisted state
// (e.g. the global theme) isn't scoped to any session.
export function register_session_key(sessionId, storageKey) {
    if(!sessionId) return;
    const listKey = session_keys_storage_key(sessionId);
    const existing = read_stored(listKey, 'keys')?.keys ?? [];
    if(existing.includes(storageKey)) return;
    write_stored(listKey, {keys: [...existing, storageKey]});
}

export function list_session_keys(sessionId) {
    return read_stored(session_keys_storage_key(sessionId), 'keys')?.keys ?? [];
}

// Drops the manifest itself -- called alongside removing every key it lists
// (see session.js's remove_session), not on its own.
export function clear_session_keys(sessionId) {
    localStorage.removeItem(session_keys_storage_key(sessionId));
}
