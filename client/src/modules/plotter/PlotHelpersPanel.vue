<!--
  Side panel section exposing this scope's own `selection` module behavior
  toggle (store/selection.js's `highlightAllUnderCursor`, off by default --
  a plain wheel always zooms; shift+wheel cycles hover one item at a time
  while this is off, falling through to zoom when it's on) -- the same
  generic per-context flag three-view's SceneHelpers.vue exposes for its
  own scenes, just without that component's geo3d-specific extras
  (highlightInvisibleOnHover) or its single-context TODO: this one properly
  resolves its own widget instance's context, like GraphSinkPanel.vue.
-->
<template>
  <NavBarEntity>
    <template #header>
      Plot Helpers
    </template>
    <template #actions><slot name="actions" /></template>

    <template #content>
      <div
        title="When off (the default), only one item under the cursor is highlighted at a time; shift+scroll-wheel cycles between them. The scroll wheel alone always zooms."
      >
        Highlight all items under cursor
        <input type="checkbox" v-model="highlightAllUnderCursor"/>
      </div>
    </template>
  </NavBarEntity>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import NavBarEntity from '@/components/NavBarEntity.vue';

const props = defineProps({
    itemId: {type: String, required: true}
});

const store = useStore();

const contextId = computed(() => store.getters['widgetInstances/instance'](props.itemId)?.contextId ?? null);
const selectionNS = computed(() => `selection_${contextId.value}`);

const highlightAllUnderCursor = computed({
    get() {
        return contextId.value ? store.state[selectionNS.value]?.highlightAllUnderCursor ?? false : false;
    },
    set(value) {
        if(contextId.value) store.commit(`${selectionNS.value}/toggle_highlight_all_under_cursor`, value);
    }
});
</script>
