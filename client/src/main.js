import { createApp } from 'vue'
import { createStore } from 'vuex'
import '@/style.css';
import "@/viewer-icons.css";
import App from './App.vue'
import { stateModule as view3D } from './ThreeView'  // viewer state module
import { stateModule as connection } from './connection'  // data source state module
import create_router from './router';
import {
  installFacetPresetPersistence
} from "@/store/facetPresetPersistence.js";

async function fetch_plugin_manifest() {
    const response = await fetch("/api/plugins", {
        headers: {
            Accept: "application/json",
        },
    })
    if (!response.ok) {
        throw new Error(
            `Could not retrieve viewer plugins: HTTP ${response.status}`
        )
    }
    return await response.json()
}

// returns list of data sources enabled by default
function collect_default_data_sources(manifest) {
    return Object.fromEntries(
        manifest.dataSources
            .filter(source => {
                return source.enabledByDefault;
            })
            .map(source => [
                source.id,
                source.url,
            ])
    )
}

async function main() {
    const pluginManifest = await fetch_plugin_manifest();
    const defaultDataSources = collect_default_data_sources(pluginManifest);
    const router = create_router();
    const app = createApp(App);

    // common application state module
    const appCommon = {
        namespaced: true,
        state: () => ({
            theme: localStorage.getItem("theme") ?? "dark"
        }),
        mutations: {
            set_theme(state, theme) {
                state.theme = theme;
                document.documentElement.dataset.theme = theme;
                localStorage.setItem("theme", theme);
            }
        }
    };

    // Compose app's store as concatenation of viewer store module (view3D) and
    // API connection state model (`connection'):
    const store = createStore({
        modules : { connection, view3D, appCommon },
    });
    installFacetPresetPersistence(store);

    app.use(store);  // BEFORE app.mount()!
    app.use(router);
    app.mount('#app');

    const savedTheme = localStorage.getItem("theme") ?? "dark";
    document.documentElement.dataset.theme = savedTheme;

    for(const [srcName, srcURL] of Object.entries(defaultDataSources)) {
        store.dispatch('connection/add_resource', {
                name: srcName,
                endpoint: srcURL,
                load: true
            });
    }
}

main().catch(error => {
    console.error("Viewer initialization failed:", error)
    document.body.textContent =
        `Viewer initialization failed: ${error.message}`
})
