// Persists which data sources are attached to a session -- not their
// fetched geometry itself (never persisted anywhere in this app; sources
// are always re-fetched live from their endpoint, same as
// geoDataBySource/view3D are never written to storage either).
import { read_stored, write_stored } from './store/persistence';

const BASE_STORAGE_KEY = 'viewer.sources.v1';

const WATCHED_MUTATIONS = new Set([
    'connection/new_resource',
    'connection/update_resource',
    'connection/remove_resource'
]);

// `sessionId` scopes this to one saved session (see
// store/modules/session.js) -- each session's attached sources persist
// independently.
export function install_connection_persistence(store, sessionId) {
    const storageKey = `${BASE_STORAGE_KEY}.${sessionId}`;

    store.subscribe((mutation, rootState) => {
        if(!WATCHED_MUTATIONS.has(mutation.type)) return;
        const sources = Object.values(rootState.connection.resources).map(
            resource => ({name: resource.name, endpoint: resource.endpoint, contextId: resource.contextId})
        );
        write_stored(storageKey, {sources});
    });
}

// Re-adds and loads every source persisted for `sessionId` -- run only
// after layout/contexts hydration (install_layout_persistence), since a
// restored source's contextId must already exist. Fire-and-forget per
// source (not awaited relative to each other), same as main.js's default-
// source seeding: one slow or dead remote shouldn't hold up the rest, or
// the session-picker modal closing.
export function restore_persisted_sources(store, sessionId) {
    const stored = read_stored(`${BASE_STORAGE_KEY}.${sessionId}`, 'sources');
    for(const {name, endpoint, contextId} of stored?.sources ?? []) {
        store.dispatch('connection/add_resource', {name, endpoint, load: false, contextId})
            .then(() => store.dispatch('connection/load_resource_data', {name}))
            .catch(error => console.error(`Failed to restore source "${name}":`, error));
    }
}
