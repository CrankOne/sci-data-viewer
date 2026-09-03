<!--
  Compact hovering toolbar (PanelResidentChrome.vue's #toolbar slot,
  rendered by Panel.vue for the wiring-diagram widget only): lets the user
  create a new scope directly from the wiring widget, without going
  through AppControls.vue's "Scopes" table -- same dataType picker + "add"
  action that table already offers (create_scene_with_viewport,
  sceneCreation.js), just as a single ActionSelect.vue "Add..." menu
  instead of a full subpanel section -- picking a type immediately creates
  and places the scope, no separate confirm step. Deliberately no capability
  to expand into anything more detailed (unlike ThreeViewport.vue's own
  hovering camera-widget bar, which can expand into a camera editor) --
  this is the whole control.
-->
<template>
  <ActionSelect
    label="Add..."
    :options="contextualModules.map(m => ({value: m.dataType, label: m.label}))"
    @select="add_scope"
  />
</template>

<script setup>
import { useStore } from 'vuex';
import { all_modules } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';
import ActionSelect from '@/components/ActionSelect.vue';

const contextualModules = all_modules().filter(mod => mod.contextual);

const store = useStore();

function add_scope(dataType) {
    create_scene_with_viewport(store, {dataType});
}
</script>
