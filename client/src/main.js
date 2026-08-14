import { createApp } from 'vue';
import { createStore } from 'vuex';

import '@/style.css';
import "@/viewer-icons.css";
import "@/framed-disclosure.css";

import App from './App.vue';
import { stateModule as connection } from './connection';  // data source state module
import appCommon from './store/modules/appCommon';
import contexts from './store/modules/contexts';
import widgetInstances from './store/modules/widgetInstances';
import ui from './store/modules/ui';
import session from './store/modules/session';
import layout from './store/modules/layout';
import create_router from './router';
import { get_active_session_id_for_tab, activate_session } from './sessionActivation';

import { all_modules } from './modules/registry';
import './modules/three-view';  // registers itself as a viewer module (dataType: 'geo3d')
// import './modules/fsm-view';  // <- future viewer modules just add a line here

async function main() {
    const router = create_router();
    const app = createApp(App);

    // Compose app's store from core state (connection, appCommon) plus
    // whatever viewer modules have registered themselves (see
    // modules/registry.js) -- core has no knowledge of any specific
    // viewer module's store shape.
    const moduleStoreModules = all_modules().reduce(
        (acc, mod) => ({...acc, ...mod.storeModules}), {}
    );
    const store = createStore({
        modules: {connection, appCommon, contexts, widgetInstances, ui, session, layout, ...moduleStoreModules}
    });

    // Mount immediately, before any session is hydrated -- ModalHost (see
    // App.vue) needs to already be in the tree so the session picker below
    // can render, and a fresh tab genuinely has nothing to hydrate yet.
    app.use(store);
    app.use(router);
    app.mount('#app');

    // Router's initial navigation (resolving whatever URL the tab was
    // opened with, including a shared-link query -- see shareLink.js) is
    // asynchronous; wait for it before anything reads router.currentRoute.
    await router.isReady();

    const savedTheme = localStorage.getItem("theme") ?? "dark";
    document.documentElement.dataset.theme = savedTheme;

    // sessionStorage survives a reload of this tab but starts empty for a
    // new tab/window -- that's the fresh-open vs. reload distinction: a
    // reload hydrates its session immediately, a fresh tab is greeted with
    // the (blocking) session picker instead, which itself calls
    // activate_session once the user picks or creates one.
    const existingSessionId = get_active_session_id_for_tab();
    if(existingSessionId) {
        await activate_session(store, existingSessionId, {isNew: false, router});
    } else {
        store.commit('ui/open_modal', {name: 'session-picker', props: {mode: 'initial'}, blocking: true});
    }
}

main().catch(error => {
    console.error("Viewer initialization failed:", error);
    document.body.textContent = `Viewer initialization failed: ${error.message}`;
});
