// Locally-saved, named "sessions" -- each bundles layout, contexts, widget
// instances, cameras, per-scene facet/selection presets, and data sources
// (see sessionActivation.js) under a shared id suffix applied to each of
// those modules' own storage keys. This module owns only the *directory*
// (the list of known sessions) plus which one is currently active; the
// actual per-session data lives in the other modules' own persistence
// files, parametrized by the active session id.
import { read_stored, write_stored } from '@/store/persistence';

const DIRECTORY_KEY = 'viewer.sessions.v1';

let idCounter = 0;
function generate_session_id() {
    idCounter += 1;
    return `sess-${Date.now().toString(36)}-${idCounter}`;
}

function read_directory() {
    const stored = read_stored(DIRECTORY_KEY, 'byId');
    return stored ?? {byId: {}, order: []};
}

function write_directory(directory) {
    write_stored(DIRECTORY_KEY, directory);
}

export default {
    namespaced: true,

    state: () => ({
        // Which session is hydrated right now (see sessionActivation.js);
        // null until activate_session() runs.
        activeId: null,
        activeName: null,
        directory: read_directory()
    }),

    getters: {
        list: state => state.directory.order.map(id => state.directory.byId[id])
    },

    mutations: {
        set_active(state, {id, name}) {
            state.activeId = id;
            state.activeName = name;
        },

        set_directory(state, directory) {
            state.directory = directory;
        },

        rename(state, {id, name}) {
            const entry = state.directory.byId[id];
            const trimmed = name?.trim();
            if(!entry || !trimmed) return;
            const directory = {
                ...state.directory,
                byId: {...state.directory.byId, [id]: {...entry, name: trimmed}}
            };
            state.directory = directory;
            write_directory(directory);
            if(id === state.activeId) state.activeName = trimmed;
        }
    },

    actions: {
        create_session({commit, state}, {name} = {}) {
            const id = generate_session_id();
            const now = Date.now();
            const entry = {
                id,
                name: name?.trim() || `Session ${state.directory.order.length + 1}`,
                createdAt: now,
                updatedAt: now
            };
            const directory = {
                byId: {...state.directory.byId, [id]: entry},
                order: [...state.directory.order, id]
            };
            commit('set_directory', directory);
            write_directory(directory);
            return id;
        },

        // Bumps a session's updatedAt -- called by sessionActivation.js
        // whenever that session's data actually changes, so the picker can
        // show "last used" ordering/info later if wanted.
        touch_session({commit, state}, id) {
            const entry = state.directory.byId[id];
            if(!entry) return;
            const directory = {
                ...state.directory,
                byId: {...state.directory.byId, [id]: {...entry, updatedAt: Date.now()}}
            };
            commit('set_directory', directory);
            write_directory(directory);
        },

        remove_session({commit, state}, id) {
            if(!state.directory.byId[id]) return;
            const byId = {...state.directory.byId};
            delete byId[id];
            const directory = {byId, order: state.directory.order.filter(existing => existing !== id)};
            commit('set_directory', directory);
            write_directory(directory);

            // Drop this session's own suffixed storage entries too, so a
            // removed session doesn't linger as dead localStorage entries.
            for(const baseKey of [
                'viewer.layout.v1',
                'viewer.camera-presets.v1',
                'viewer.sources.v1'
            ]) {
                localStorage.removeItem(`${baseKey}.${id}`);
            }
            // Per-context facet/selection-set keys (viewer.facet-presets.v1.<id>.<contextId>,
            // viewer.selection-sets.v1.<id>.<contextId>) aren't enumerable from here
            // without scanning localStorage keys -- harmless if left behind (same
            // as a removed context's own keys today), just an accepted, bounded leak.
        }
    }
};
