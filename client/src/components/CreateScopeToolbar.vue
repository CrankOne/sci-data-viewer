<!--
  Compact hovering toolbar (PanelResidentChrome.vue's #toolbar slot,
  rendered by Panel.vue for the wiring-diagram widget only): lets the user
  create a new scope directly from the wiring widget, without going
  through AppControls.vue's "Scopes" table -- same dataType picker + "add"
  action that table already offers (create_scene_with_viewport,
  sceneCreation.js), just as a small always-visible row instead of a full
  subpanel section. Deliberately no capability to expand into anything more
  detailed (unlike ThreeViewport.vue's own hovering camera-widget bar,
  which can expand into a camera editor) -- this is the whole control.
-->
<template>
  <select v-model="dataType" title="Scope type" aria-label="Scope type">
    <option v-for="m in contextualModules" :key="m.dataType" :value="m.dataType">{{ m.label }}</option>
  </select>
  <button type="button" title="Create scope" aria-label="Create scope" :disabled="!dataType" @click="add_scope">
    +
  </button>
</template>

<script setup>
import { ref } from 'vue';
import { useStore } from 'vuex';
import { all_modules } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';

const contextualModules = all_modules().filter(mod => mod.contextual);
const dataType = ref(contextualModules[0]?.dataType ?? '');

const store = useStore();

function add_scope() {
    if(!dataType.value) return;
    create_scene_with_viewport(store, {dataType: dataType.value});
}
</script>
