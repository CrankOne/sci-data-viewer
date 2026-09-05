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

  Also offers "Transform" (store/modules/transforms.js) -- kept in sync
  with SinkWiringPanel.vue's own pane-right-click menu, which offers the
  same two things (a scope per contextual module, plus "New transform") for
  the same reason: this toolbar and that menu are two entry points to the
  same action, not two separate features.
-->
<template>
  <ActionSelect
    label="Add..."
    :options="[
      ...contextualModules.map(m => ({value: m.dataType, label: m.label})),
      {value: TRANSFORM_OPTION, label: 'Transform'}
    ]"
    @select="add_item"
  />
</template>

<script setup>
import { useStore } from 'vuex';
import { all_modules } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';
import ActionSelect from '@/components/ActionSelect.vue';

// Never a real dataType (modules/registry.js's own values are always a
// plugin/module-declared identifier, never this literal) -- safe as an
// <select> option value distinguishing "New transform" from every
// contextual module's own entry above it in the same flat option list.
const TRANSFORM_OPTION = '__transform__';

const contextualModules = all_modules().filter(mod => mod.contextual);

const store = useStore();

function add_item(value) {
    if(value === TRANSFORM_OPTION) store.dispatch('transforms/create_transform', {});
    else create_scene_with_viewport(store, {dataType: value});
}
</script>
