// The single path that hydrates a saved session's persisted state into a
// live store -- called both at boot (main.js, for a reload of a tab that
// already has an active session) and from SessionPickerModal.vue (a fresh
// tab with no session chosen yet, or an explicit "create new session").
// Switching away from an *already-hydrated* session to a different one
// goes through a full page reload instead (see SessionPickerModal.vue) --
// simpler and lower-risk than tearing down and rehydrating live.
import { all_modules, get_module } from './modules/registry';
import { install_layout_persistence } from './store/modules/layoutPersistence';
import { install_connection_persistence, restore_persisted_sources } from './connectionPersistence';

const ACTIVE_SESSION_KEY = 'viewer.active-session-id';

// sessionStorage survives a reload of this tab but starts empty for a new
// tab/window -- exactly the fresh-open vs. reload distinction needed here,
// with no custom bookkeeping required.
export function get_active_session_id_for_tab() {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY);
}

async function fetch_plugin_manifest() {
    const response = await fetch("/api/plugins", {
        headers: {Accept: "application/json"}
    });
    if(!response.ok)
        throw new Error(`Could not retrieve viewer plugins: HTTP ${response.status}`);
    return await response.json();
}

function collect_default_data_sources(manifest) {
    return Object.fromEntries(
        manifest.dataSources
            .filter(source => source.enabledByDefault)
            .map(source => [source.id, source.url])
    );
}

// Seeds a brand-new session with the plugin manifest's default sources --
// same two-step resolve-then-load sequencing as the interactive add-source
// flow (see connection.js), just with the default scene picked
// automatically instead of via a picker (there's no UI to show one for
// this, at boot). Not awaited by activate_session -- fire-and-forget, same
// as this always behaved before sessions existed.
async function seed_default_sources(store) {
    const manifest = await fetch_plugin_manifest();
    const defaultDataSources = collect_default_data_sources(manifest);

    for(const [srcName, srcURL] of Object.entries(defaultDataSources)) {
        store.dispatch('connection/add_resource', {name: srcName, endpoint: srcURL, load: false})
            .then(() => {
                const resource = store.state.connection.resources[srcName];
                const module = get_module(resource?.type);
                const contextId = module?.contextual
                    ? store.getters['contexts/listForType'](module.dataType)[0]?.id ?? null
                    : null;
                return store.dispatch('connection/assign_resource_context', {name: srcName, contextId})
                    .then(() => store.dispatch('connection/load_resource_data', {name: srcName}));
            })
            .catch(error => console.error(`Failed to load default data source "${srcName}":`, error));
    }
}

// Hydrates `sessionId`'s persisted state into `store`: layout, contexts,
// widget instances, and cameras always; sources are either seeded from the
// plugin's defaults (a brand-new session, `isNew`) or restored from what
// was previously attached to this session.
export async function activate_session(store, sessionId, {isNew = false} = {}) {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    const name = store.state.session.directory.byId[sessionId]?.name ?? null;
    store.commit('session/set_active', {id: sessionId, name});

    install_layout_persistence(store, sessionId);
    for(const mod of all_modules()) mod.installPersistence?.(store, sessionId);
    install_connection_persistence(store, sessionId);

    if(isNew) {
        seed_default_sources(store);
    } else {
        restore_persisted_sources(store, sessionId);
    }

    store.commit('ui/close_modal');
}
