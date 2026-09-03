<!--
  Side panel section stub for the plotter's own facet-based legend/styling
  scheme (doc/module-plotter.rst's "Styling") -- today, literally just this
  scope's own current selection, listed by id. Exists so a "Data Groups"
  section already has somewhere to live once styling/grouping actually
  needs configuring, not as an attempt at that UI yet: the eventually-
  intended version -- browsing/assigning a `group` facet, previewing the
  resulting legend, selection-preset management -- is expected to resemble
  :doc:`module-3d-viewer`'s own Items Tree (modules/three-view/components/
  ItemsTree/: items tree + selection-preset editor + facets editor), but
  generalizing that component to be usable across modules is a distinct,
  dedicated task of its own, not started here.
-->
<template>
  <NavBarEntity>
    <template #header>
      Data Groups
    </template>
    <template #actions><slot name="actions" /></template>

    <template #content>
      <p v-if="selectedIds.length === 0" class="empty-state">
        Nothing selected -- click, shift+click, or drag a rectangle over
        items in the plot to select them.
      </p>
      <ul v-else class="data-groups-list">
        <li v-for="id in selectedIds" :key="id" class="data-groups-item">{{ id }}</li>
      </ul>
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
const selectionNS = computed(() => contextId.value ? `selection_${contextId.value}` : null);

const selectedIds = computed(() =>
    selectionNS.value ? [...store.getters[`${selectionNS.value}/selectedItemIDs`]].sort() : []);
</script>

<style scoped>
.empty-state {
  color: var(--clr-fg-main-muted);
  font-style: italic;
  margin: 0.3rem 0;
}

.data-groups-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}

.data-groups-item {
  border: 1px solid var(--clr-border-inactive);
  border-radius: 3pt;
  padding: 2pt 6pt;
  font-family: var(--font-data);
  font-size: .8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
