<!--
  Side panel section (doc/module-graph.rst's "Nested graphs"): lists every
  drill-down target advertised by this board's resources' own
  `graphData.nestedGraphs`, and offers a "back" control once drilled into
  one. Generic over any `graph`-typed source -- reads only the opaque
  {itemId, path, label} shape the doc defines, na64umff-specific or not.

  Drilling itself is plain cross-namespace orchestration in this component,
  the same pattern DiagramViewport.vue's own open_sink_picker already uses
  for its root-level 'ui'/'contexts' calls: read the resource's current
  selectedItemId (connection.js, root), remember it as this resource's
  drill ancestor (store/graphBoard.js), then re-fetch the resource at the
  chosen itemId via connection.js's existing load_resource_data -- no new
  fetch/addressing logic needed, an itemId is resolved exactly like any
  other addressable item (doc/sources.rst).
-->
<template>
  <NavBarEntity>
    <template #header>
      Nested procedures
    </template>
    <template #actions><slot name="actions" /></template>

    <template #content>
      <div v-if="!visibleResourceNames.length" class="empty-state">
        No nested sub-procedures advertised by the current graph.
      </div>

      <div v-else class="nested-graphs-panel">
        <div v-for="resourceName in visibleResourceNames" :key="resourceName" class="nested-graphs-panel__resource">
          <h5 v-if="visibleResourceNames.length > 1">{{ resourceName }}</h5>

          <button
            v-if="drillRootFor(resourceName) !== null"
            type="button"
            class="nested-graphs-panel__back"
            @click="drill_back(resourceName)"
          >
            &larr; Back to full procedure
          </button>

          <ul v-if="entriesFor(resourceName).length" class="nested-graphs-panel__items">
            <li v-for="entry in entriesFor(resourceName)" :key="entry.itemId">
              <button
                type="button"
                class="nested-graphs-panel__entry"
                :title="entry.path"
                @click="drill_into(entry)"
              >
                {{ entry.label }}
              </button>
            </li>
          </ul>
        </div>
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
const boardNS = computed(() => `graphBoard_${contextId.value}`);

const allNestedGraphs = computed(() => contextId.value ? store.getters[`${boardNS.value}/allNestedGraphs`] : []);

const resourceNames = computed(() => {
    if(!contextId.value) return [];
    return Object.keys(store.getters[`${boardNS.value}/dataByResource`] ?? {});
});

// Only resources that currently have something to show: either entries to
// drill into, or a "back" control because one was already picked.
const visibleResourceNames = computed(() =>
    resourceNames.value.filter(name => entriesFor(name).length || drillRootFor(name) !== null)
);

function entriesFor(resourceName) {
    return allNestedGraphs.value.filter(entry => entry.resourceName === resourceName);
}

function drillRootFor(resourceName) {
    return contextId.value ? store.getters[`${boardNS.value}/drillRoot`](resourceName) : null;
}

function drill_into(entry) {
    if(!contextId.value) return;
    const resource = store.state.connection.resources[entry.resourceName];
    if(!resource) return;
    store.commit(`${boardNS.value}/set_drill_root`, {
        resourceName: entry.resourceName, rootItemId: resource.selectedItemId, drilledItemId: entry.itemId
    });
    store.dispatch('connection/load_resource_data', {name: entry.resourceName, itemId: entry.itemId});
}

// No explicit clear here: `drillRoot` (store/graphBoard.js) compares the
// remembered `drilledItemId` against the resource's own live
// `selectedItemId` on every read, so once `drill_back` below re-fetches the
// resource at its remembered `rootItemId`, that comparison stops matching
// on its own -- no mutation-time cleanup needed.
function drill_back(resourceName) {
    const rootItemId = drillRootFor(resourceName);
    if(rootItemId === null) return;
    store.dispatch('connection/load_resource_data', {name: resourceName, itemId: rootItemId});
}
</script>

<style scoped>
.empty-state {
    color: var(--clr-fg-main-muted);
    font-style: italic;
    padding: 0.3rem 0;
}

.nested-graphs-panel {
    display: grid;
    gap: 0.6rem;
}

.nested-graphs-panel__resource h5 {
    margin: 0 0 0.3rem;
    color: var(--clr-fg-main-muted);
    font-weight: 600;
}

.nested-graphs-panel__back {
    display: block;
    width: 100%;
    text-align: left;
    margin-bottom: 0.3rem;
}

.nested-graphs-panel__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
    font-size: 0.85rem;
}

.nested-graphs-panel__entry {
    display: block;
    width: 100%;
    text-align: left;
    border: 1px solid var(--clr-border-inactive);
    border-radius: 3pt;
    padding: 3pt 6pt;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.nested-graphs-panel__entry:hover {
    background: var(--clr-bg-panel-header);
}
</style>
