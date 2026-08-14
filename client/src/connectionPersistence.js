// Persists which data sources are attached to a session -- not their
// fetched geometry itself (never persisted anywhere in this app; sources
// are always re-fetched live from their endpoint, same as
// geoDataBySource/view3D are never written to storage either).
import { read_stored, write_stored, register_session_key } from './store/persistence';

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
    register_session_key(sessionId, storageKey);

    store.subscribe((mutation, rootState) => {
        if(!WATCHED_MUTATIONS.has(mutation.type)) return;
        const sources = Object.values(rootState.connection.resources).map(
            resource => ({
                name: resource.name,
                endpoint: resource.endpoint,
                contextId: resource.contextId,
                // Which item an addressable source (doc/sources.rst) had
                // loaded, if any, so a restore picks the same file back up
                // instead of leaving the widget bare -- see
                // restore_persisted_sources below. Always null for a plain
                // source.
                selectedItemId: resource.selectedItemId ?? null,
                // Last page of the item listing the user was browsing (see
                // sourceListItems/addressable.vue) -- soft persistence, so
                // a reload resumes browsing where it left off.
                page: resource.page ?? 0
            })
        );
        write_stored(storageKey, {sources});
    });
}

// Re-adds and loads every source persisted for `sessionId` -- run only
// after layout/contexts hydration (install_layout_persistence), since a
// restored source's contextId must already exist. Not awaited by the
// caller (see sessionActivation.js's activate_session): one slow or dead
// remote shouldn't hold up the rest, or the session-picker modal closing.
// The returned promise still settles once every source here has -- used
// only to sequence a shared link's own item-loads (shareLink.js) strictly
// *after* these, so the two can never race the same resource and have the
// wrong one win.
export function restore_persisted_sources(store, sessionId) {
    const stored = read_stored(`${BASE_STORAGE_KEY}.${sessionId}`, 'sources');
    const attempts = (stored?.sources ?? []).map(({name, endpoint, contextId, selectedItemId, page}) =>
        // `load: false' here, then decide below once the manifest (and its
        // "addressable" flag) is known -- an addressable source's data-url
        // enumerates items rather than being a fetchable payload itself
        // (doc/sources.rst), so it must not be fetched the same way a plain
        // source's is; see connection.js's add_resource/load_resource_data.
        store.dispatch('connection/add_resource', {name, endpoint, load: false, contextId, selectedItemId, page: page ?? 0})
            .then(manifest => {
                if(!manifest) return; // fetch aborted/failed; nothing to load
                if(manifest.addressable) {
                    if(selectedItemId) {
                        return store.dispatch('connection/load_resource_data', {name, itemId: selectedItemId});
                    }
                    return; // enumerable source restored bare -- user re-picks a file
                }
                return store.dispatch('connection/load_resource_data', {name});
            })
            .catch(error => console.error(`Failed to restore source "${name}":`, error))
    );
    return Promise.allSettled(attempts);
}
