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
import { fetch_plugin_manifest } from './pluginManifest';
import { create_scene_with_viewport } from './sceneCreation';
import { apply_share_from_route } from './shareLink';

const ACTIVE_SESSION_KEY = 'viewer.active-session-id';

// sessionStorage survives a reload of this tab but starts empty for a new
// tab/window -- exactly the fresh-open vs. reload distinction needed here,
// with no custom bookkeeping required.
export function get_active_session_id_for_tab() {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY);
}

function collect_default_data_sources(manifest) {
    return Object.fromEntries(
        manifest.dataSources
            .filter(source => source.enabledByDefault)
            .map(source => [source.id, source.url])
    );
}

// A default-enabled source of a contextual type needs a scene to load
// into, same as the interactive add-source flow (AddSourceModal.vue) --
// but there's no picker to show at boot, and since build_default_root() no
// longer pre-creates one (see layoutDefaults.js), one may not exist yet
// either. Reuses whichever context of that type already exists, if any
// (e.g. a second default source of the same contextual type), otherwise
// creates one via sceneCreation.js's shared helper -- targeting the
// still-empty main panel build_default_root() left for exactly this,
// so a default-enabled source ends up in the same clean two-panel layout
// a manually-added first source would (rather than sceneCreation's
// wrap-the-whole-tree fallback, which is only needed once nothing empty
// is left to reuse).
async function resolve_default_context(store, module) {
    if(!module?.contextual) return null;
    const existing = store.getters['contexts/listForType'](module.dataType)[0];
    if(existing) return existing.id;
    const targetPanelId = store.getters['layout/firstEmptyItemsLeafId'];
    const created = await create_scene_with_viewport(store, {dataType: module.dataType, targetPanelId});
    return created.contextId;
}

// Seeds a brand-new session with the plugin manifest's default sources --
// same two-step resolve-then-load sequencing as the interactive add-source
// flow (see connection.js), just with the default scene picked
// automatically instead of via a picker (there's no UI to show one for
// this, at boot). Not awaited by activate_session -- fire-and-forget, same
// as this always behaved before sessions existed. The returned promise
// still settles once every default source here has -- see
// restore_persisted_sources (connectionPersistence.js) for why that's
// useful despite the fire-and-forget call.
async function seed_default_sources(store) {
    const manifest = await fetch_plugin_manifest();
    const defaultDataSources = collect_default_data_sources(manifest);

    const attempts = Object.entries(defaultDataSources).map(([srcName, srcURL]) =>
        store.dispatch('connection/add_resource', {name: srcName, endpoint: srcURL, load: false})
            .then(async () => {
                const resource = store.state.connection.resources[srcName];
                const module = get_module(resource?.type);
                const contextId = await resolve_default_context(store, module);
                await store.dispatch('connection/assign_resource_context', {name: srcName, contextId});
                // An addressable source (doc/sources.rst) has no single
                // default payload to fetch -- its data-url enumerates
                // items instead. Leave it "ready" and let the user pick
                // one from its widget (sourceListItems/addressable.vue).
                if(!resource?.manifest?.addressable) {
                    await store.dispatch('connection/load_resource_data', {name: srcName});
                }
            })
            .catch(error => console.error(`Failed to load default data source "${srcName}":`, error))
    );
    return Promise.allSettled(attempts);
}

// Hydrates `sessionId`'s persisted state into `store`: layout, contexts,
// widget instances, and cameras always; sources are either seeded from the
// plugin's defaults (a brand-new session, `isNew`) or restored from what
// was previously attached to this session.
//
// `router`, if given, is used to apply and then strip a shared-link query
// param (see shareLink.js) once this session's own resources are in place --
// every caller has one (main.js at boot, SessionPickerModal.vue's pick/
// create/import flows), so it's optional only for tests/callers that
// genuinely have no router to hand.
export async function activate_session(store, sessionId, {isNew = false, router = null} = {}) {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    const name = store.state.session.directory.byId[sessionId]?.name ?? null;
    store.commit('session/set_active', {id: sessionId, name});

    install_layout_persistence(store, sessionId);
    for(const mod of all_modules()) mod.installPersistence?.(store, sessionId);
    install_connection_persistence(store, sessionId);

    // Neither branch is awaited here -- a slow or dead remote shouldn't hold
    // up the modal closing just below, same as always. Each still returns a
    // promise that settles once every source it touches has, though: a
    // shared link (see shareLink.js) targets these exact same resources, so
    // applying it has to wait for this to *settle* first, or the two race
    // to set the same resource's loaded item and whichever finishes last
    // silently wins -- which used to happen, at least occasionally, before
    // this sequencing existed.
    const sourcesSettled = isNew ? seed_default_sources(store) : restore_persisted_sources(store, sessionId);

    if(router) {
        sourcesSettled
            .then(() => apply_share_from_route(store, router))
            .catch(error => console.error('Failed to apply shared link:', error));
    }

    store.commit('ui/close_modal');
}
