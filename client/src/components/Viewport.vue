<template>
  <div id="container">
    <div id="evdspViewport" ref="viewport">
        <!-- three.js container -->
    </div>
    <div id="widgets">
        <span>
            <select v-model="viewportSettings.currentCamera">
                <option v-for="(_,k) in viewportSettings.cameras" v-bind:value="k">
                    {{k}}
                </option>
            </select>
        </span>
        <component :is="cCamComponent"
                v-bind="{'settings': cCamSettings}"
                />
    </div>
  </div>
</template>

<script setup>
import {watch, watchEffect, readonly, ref, reactive, onMounted, computed} from 'vue';
import {useStore} from 'vuex';
import PerspCamCtrls from './PerspCamCtrls.vue';
import OrthoCamCtrls from './OrthoCamCtrls.vue';
import {ThreeView} from '../ThreeView.js';

const viewportSettings = reactive({
        cameras: {
            orthoXY: { type: "ortho"
                //, lr: [ -10, 10 ]
                //, tb: [ -10, 10 ]
                , width: 10
                , cuts: [ 0.01, 70000 ]
                //
                , up: [0, -1, 0]
                , lookAt: [0, 0, 5500]
                , position: [0, 0, -10]
                //, aspect: 1  // TODO?
            },
            persp1: { type: "persp"
                , fov: 10
                , position: [1500, 1500, 1500]
                , cuts: [0.1, 70000]  // near, far
                , lookAt: [0, 0, 0]
                , aspect: 1
                //, up: [0, 1, 0]  // TODO?
            },
            // ... more cameras?
        },
        // currently active camera
        currentCamera: 'persp1',
    });

const store = useStore();

const cCamComponent = computed(() => {
    if( viewportSettings.cameras[viewportSettings.currentCamera].type == "persp" ) {
        return PerspCamCtrls;
    } else if(viewportSettings.cameras[viewportSettings.currentCamera].type == "ortho") {
        return OrthoCamCtrls;
    }
    return null;
});

const cCamSettings = computed(() => viewportSettings.cameras[viewportSettings.currentCamera]);

let mouseMoveDebouncingTimerID = null;

const viewport = ref(null);

onMounted(() => {
    const viewObj = new ThreeView( viewport.value
                               , viewportSettings
                               , store
                               );
    const rob = new ResizeObserver(viewObj.on_resize.bind(viewObj));
    rob.observe(viewport.value);
    // mouse tracking (debounced by *msec, to avoid too often raycasting)
    if(viewport.value) {
        //viewport.value.addEventListener('mouseenter', e => console.log('entere', e.x, e.y));
        viewport.value.addEventListener('mousemove',  e => {
                if(mouseMoveDebouncingTimerID) clearTimeout(mouseMoveDebouncingTimerID);
                mouseMoveDebouncingTimerID = setTimeout(() => {
                                viewObj.update_pointer(e);
                            }, 300);
            });
        viewport.value.addEventListener('mouseleave', e => {
                if(!mouseMoveDebouncingTimerID) return;
                clearTimeout(mouseMoveDebouncingTimerID);
            });
    }
});

</script>

<style scoped>
#evdspViewport {
    min-width: 100px;
    min-height: 100vh;
}
#widgets {
    position: absolute;
    top: 15px;
    left: 15px;
    background-color: #7643;
    padding: 5pt 7pt;
    min-width: 100pt;
    width: 50%;
}
</style>
