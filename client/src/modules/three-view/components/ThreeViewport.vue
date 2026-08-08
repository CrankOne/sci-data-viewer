<template>
  <div class="viewport-container">
    <div
      ref="viewportElement"
      class="three-viewport"
    />

    <aside
      class="camera-widget"
      :class="{ expanded: editorOpened }"
    >
      <div class="camera-widget__bar">
        <select
          class="camera-widget__select"
          :value="currentPresetName"
          title="Camera preset"
          @change="select_camera($event.target.value)"
        >
          <option
            v-for="name in presetNames"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select>

        <button
          class="icon-button"
          type="button"
          :aria-expanded="editorOpened"
          :title="editorOpened ? 'Hide details' : 'Show details'"
          @click="editorOpened = !editorOpened"
        >
          <span
            class="vi"
            :class="editorOpened ? 'vi-minus-framed' : 'vi-plus-framed'"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-if="editorOpened && currentCamera"
        class="camera-widget__panel"
      >
        <div class="camera-widget__toolbar">
          <button
            class="icon-button"
            type="button"
            title="Save current camera as"
            @click="save_as"
          >
            <span class="vi vi-save" aria-hidden="true"/>
          </button>

          <button
            class="icon-button"
            type="button"
            title="New perspective camera"
            @click="create_perspective"
          >
            <span class="vi vi-add-perspective-view" aria-hidden="true"/>
          </button>

          <button
            class="icon-button"
            type="button"
            title="New orthographic camera"
            @click="create_orthographic"
          >
            <span class="vi vi-add-orthographic-view" aria-hidden="true"/>
          </button>

          <button
            class="icon-button"
            type="button"
            title="Reset current camera"
            @click="reset_camera"
          >
            <span class="vi vi-camera-reset" aria-hidden="true"/>
          </button>

          <button
            class="icon-button"
            type="button"
            title="Frame selected or visible objects"
            @click="frame_objects"
          >
            <span class="vi vi-frame-selected" aria-hidden="true"/>
          </button>

          <button
            class="icon-button"
            type="button"
            title="Remove current camera"
            :disabled="presetNames.length <= 1"
            @click="remove_camera"
          >
            <span class="vi vi-trash-bin" aria-hidden="true"/>
          </button>
        </div>

        <component
          :is="cameraEditorComponent"
          :camera="currentCamera"
          :aspect="viewportState.aspect"
          @patch="patch_current_camera"
        />
      </div>
    </aside>

    <!-- Reserved for the future orientation-cube manipulator. -->
    <div
      ref="orientationWidget"
      class="orientation-widget"
      hidden
    />
  </div>
</template>

<script setup>
import {
    computed,
    onBeforeUnmount,
    onMounted,
    ref
} from 'vue';
import { useStore } from 'vuex';

import PerspectiveCameraControls from './PerspCamCtrls.vue';
import OrthographicCameraControls from './OrthoCamCtrls.vue';
import { ThreeView } from '../three';

const VIEWPORT_ID = 'main';

const store = useStore();
const viewportElement = ref(null);
const orientationWidget = ref(null);
const editorOpened = ref(false);

let view = null;
let resizeObserver = null;
let pointerTimer = null;

const presetNames = computed(() => store.getters['cameras/presetNames']);

const currentPresetName = computed(() => store.getters['cameras/currentPresetName'](VIEWPORT_ID));

const currentCamera = computed(() => store.getters['cameras/currentPreset'](VIEWPORT_ID));

const viewportState = computed(() => store.getters['cameras/viewportState'](VIEWPORT_ID));

const cameraEditorComponent = computed(() => {
    switch(currentCamera.value?.type) {
    case 'perspective':
        return PerspectiveCameraControls;
    case 'orthographic':
        return OrthographicCameraControls;
    default:
        return null;
    }
});

function select_camera(name) {
    store.dispatch('cameras/select_preset', {viewportID: VIEWPORT_ID, name});
}

function patch_current_camera(patch) {
    store.commit('cameras/patch_preset', {name: currentPresetName.value, patch});
}

async function create_perspective() {
    await store.dispatch('cameras/create_persp_view', {viewportID: VIEWPORT_ID});
}

async function create_orthographic() {
    await store.dispatch('cameras/create_ortho_view', {viewportID: VIEWPORT_ID});
}

async function reset_camera() {
    await store.dispatch('cameras/reset_current', {viewportID: VIEWPORT_ID});
}

async function remove_camera() {
    await store.dispatch('cameras/remove_current', {viewportID: VIEWPORT_ID});
}

async function save_as() {
    const initialName = currentPresetName.value;
    const name = window.prompt('Camera preset name:', initialName);

    if(name === null || !name.trim())
        return;

    await store.dispatch('cameras/save_current_as', {viewportID: VIEWPORT_ID, name});
}

function frame_objects() {
    view?.frame_selected_or_visible();
}

function schedule_pointer_update(event) {
    if(pointerTimer !== null)
        clearTimeout(pointerTimer);

    // Retain only coordinates; the MouseEvent itself need not survive.
    const pointer = {
        clientX: event.clientX,
        clientY: event.clientY
    };

    pointerTimer = window.setTimeout(() => {
        pointerTimer = null;
        view?.update_pointer(pointer);
    }, 20);
}

function cancel_pointer_update() {
    if(pointerTimer !== null) {
        clearTimeout(pointerTimer);
        pointerTimer = null;
    }
    view?.clear_pointer();
}

onMounted(() => {
    view = new ThreeView({
        element: viewportElement.value,
        store,
        viewportID: VIEWPORT_ID
    });

    resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;

        store.commit('cameras/resize_viewport', {
            viewportID: VIEWPORT_ID,
            widthPx: width,
            heightPx: height
        });

        view.resize(width, height);
    });

    resizeObserver.observe(viewportElement.value);

    viewportElement.value.addEventListener('mousemove', schedule_pointer_update);
    viewportElement.value.addEventListener('mouseleave', cancel_pointer_update);
});

onBeforeUnmount(() => {
    cancel_pointer_update();
    resizeObserver?.disconnect();

    viewportElement.value?.removeEventListener('mousemove', schedule_pointer_update);
    viewportElement.value?.removeEventListener('mouseleave', cancel_pointer_update);

    view?.dispose();
    view = null;
});
</script>

<style scoped>
.viewport-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.three-viewport {
    position: absolute;
    inset: 0;
}

.camera-widget {
    position: absolute;
    z-index: 10;
    top: 0.75rem;
    left: 0.75rem;

    max-width: min(36rem, calc(100% - 1.5rem));

    border: 1px solid var(--clr-border-inactive);
    border-radius: 0.25rem;
    background: var(--clr-neutral-transparent);
    backdrop-filter: blur(3px);
}

.camera-widget__bar {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem;
}

.camera-widget__select {
    min-width: 8rem;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
}

.camera-widget__panel {
    padding: 0 0.4rem 0.4rem;
}

.camera-widget__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding-block: 0.35rem;
    border-top: 1px solid var(--clr-border-inactive);
}

.icon-button {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
}

.orientation-widget {
    position: absolute;
    z-index: 9;
    top: 0.75rem;
    right: 0.75rem;
    width: 6rem;
    height: 6rem;
}
</style>
