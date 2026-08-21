// The single path that hydrates a saved session's persisted state into a
// live store -- called both at boot (main.js, for a reload of a tab that
// already has an active session) and from SessionPickerModal.vue (a fresh
// tab with no session chosen yet, or an explicit "create new session").
// Switching away from an *already-hydrated* session to a different one
// goes through a full page reload instead (see SessionPickerModal.vue) --
// simpler and lower-risk than tearing down and rehydrating live.
import { all_modules } from './modules/registry';
import { install_layout_persistence } from './store/modules/layoutPersistence';
import { install_connection_persistence, restore_persisted_sources } from './connectionPersistence';
import { apply_share_from_route } from './shareLink';

const ACTIVE_SESSION_KEY = 'viewer.active-session-id';

// sessionStorage survives a reload of this tab but starts empty for a new
// tab/window -- exactly the fresh-open vs. reload distinction needed here,
// with no custom bookkeeping required.
export function get_active_session_id_for_tab() {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY);
}

// Hydrates `sessionId`'s persisted state into `store`: layout, contexts,
// widget instances, and cameras always; sources are restored from what
// was previously attached to this session, or -- for a brand-new session,
// `isNew` -- left empty for the user to add via the interactive
// "add source" flow (AddSourceModal.vue). Plugin-declared default sources
// used to be auto-seeded here; removed once persistent sessions made that
// only fire once per session's lifetime (see doc/ui-session.rst) rather
// than on every reload, which was the point of it during plugin
// development.
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

    // Not awaited here -- a slow or dead remote shouldn't hold up the modal
    // closing just below, same as always. Still resolves once every
    // restored source has settled, though: a shared link (see
    // shareLink.js) targets these exact same resources, so applying it has
    // to wait for this to *settle* first, or the two race to set the same
    // resource's loaded item and whichever finishes last silently wins --
    // which used to happen, at least occasionally, before this sequencing
    // existed.
    const sourcesSettled = isNew ? Promise.resolve() : restore_persisted_sources(store, sessionId);

    if(router) {
        sourcesSettled
            .then(() => apply_share_from_route(store, router))
            .catch(error => console.error('Failed to apply shared link:', error));
    }

    store.commit('ui/close_modal');
}
