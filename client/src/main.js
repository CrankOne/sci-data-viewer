import { createApp } from 'vue';
import { createStore } from 'vuex';

import '@/style.css';
import "@/viewer-icons.css";
import "@/framed-disclosure.css";

import App from './App.vue';
import { stateModule as connection } from './connection';  // data source state module
import appCommon from './store/modules/appCommon';
import layout from './store/modules/layout';
import { install_layout_persistence } from './store/modules/layoutPersistence';
import create_router from './router';

import { all_modules } from './modules/registry';
import './modules/three-view';  // registers itself as a viewer module (dataType: 'geo3d')
// import './modules/fsm-view';  // <- future viewer modules just add a line here

async function fetch_plugin_manifest() {
    const response = await fetch("/api/plugins", {
        headers: {Accept: "application/json"}
    });
    if(!response.ok)
        throw new Error(`Could not retrieve viewer plugins: HTTP ${response.status}`);
    return await response.json();
}

// returns list of data sources enabled by default
function collect_default_data_sources(manifest) {
    return Object.fromEntries(
        manifest.dataSources
            .filter(source => source.enabledByDefault)
            .map(source => [source.id, source.url])
    );
}

async function main() {
    const pluginManifest = await fetch_plugin_manifest();
    const defaultDataSources = collect_default_data_sources(pluginManifest);
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
        modules: {connection, appCommon, layout, ...moduleStoreModules}
    });

    for(const mod of all_modules()) mod.installPersistence?.(store);
    install_layout_persistence(store);

    app.use(store);  // BEFORE app.mount()!
    app.use(router);
    app.mount('#app');

    const savedTheme = localStorage.getItem("theme") ?? "dark";
    document.documentElement.dataset.theme = savedTheme;

    for(const [srcName, srcURL] of Object.entries(defaultDataSources)) {
        store.dispatch('connection/add_resource', {name: srcName, endpoint: srcURL, load: true});
    }
}

main().catch(error => {
    console.error("Viewer initialization failed:", error);
    document.body.textContent = `Viewer initialization failed: ${error.message}`;
});
