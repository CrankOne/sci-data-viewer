import { createApp } from 'vue'
import { createStore } from 'vuex'
import { createRouter, createWebHashHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import ThreeViewer from './components/ThreeViewer.vue'
//import Runs from './components/Runs.vue'
//import Run from './components/Run.vue'
//import Spill from './components/Spill.vue'
import { stateModule as view3D } from './ThreeView'
import { stateModule as connection } from './api'

let defaultDataEndpoint = import.meta.env.VITE_DEFAULT_BACKEND_URL;
if(!defaultDataEndpoint)
    defaultDataEndpoint = 'http://' + location.host;

// Compose app's store as concatenation of viewe store module (view3D) and
// API connection state model (`connection'):
const store = createStore({
    modules : { connection, view3D },
});

const routes = [
    // redirect root to ThreeViewer's component
    {path: '/', redirect: '/three-view/' /*+ encodeURIComponent(defaultDataEndpoint)*/},
    {path: '/three-view/'
        , component: ThreeViewer
        , props: {
                defaultDataSources: {
                    'Default source': defaultDataEndpoint
                }
            }
        , name: 'three-view'
        },
    //{path: '/', redirect: '/runs/' + encodeURIComponent(defaultBackendHost)},
    //{path: '/runs/:backendProvider', component: Runs, props: true, name: 'runs'},
    //{path: '/run/:backendProvider/run/:runNo', component: Run, props: true, name: 'run' },
    //{path: '/run/:backendProvider/run/:runNo/spill/:spillNo', component: Spill, props: true, name: 'spill' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

//createApp(App).mount('#app')
const app = createApp(App);
app.use(store);  // BEFORE app.mount()!
app.use(router);
app.mount('#app');

// add; xxx, gets triggered before watchers are bound within three viewers
//store.dispatch('connection/add_data_source', {name:'Test Source', endpoint:'http://foo.bar'});

