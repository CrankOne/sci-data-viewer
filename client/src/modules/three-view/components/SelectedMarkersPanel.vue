<template>
  <NavBarEntity>
    <template #header>
      Selected markers
    </template>
    <template #actions><slot name="actions" /></template>

    <template #content>
      <div v-if="rows.length === 0" class="empty-state">
        No markers selected -- shift+click an individual marker in the scene to pick it.
      </div>

      <div v-else class="selected-markers-widget">
        <div class="selected-markers-toolbar">
          <span class="selected-markers-count">{{ rows.length }} selected</span>
          <button type="button" @click="clear_all">Clear all</button>
        </div>

        <ul class="selected-markers-list">
          <li v-for="row in rows" :key="`${row.geoID}#${row.index}`" class="selected-marker-row">
            <div class="selected-marker-main">
              <span class="selected-marker-label" :title="row.geoID">{{ row.label }}</span>
              <span class="selected-marker-index">#{{ row.index }}</span>
            </div>
            <div v-if="row.facetEntries.length" class="selected-marker-facets">
              <span v-for="[name, value] in row.facetEntries" :key="name" class="selected-marker-facet">
                {{ name }}: {{ value }}
              </span>
            </div>
            <div v-if="row.position" class="selected-marker-position">
              x={{ fmt(row.position[0]) }}, y={{ fmt(row.position[1]) }}, z={{ fmt(row.position[2]) }}
            </div>
            <button
              type="button"
              class="icon-button"
              title="Deselect"
              aria-label="Deselect"
              @click="remove(row.geoID, row.index)"
            >
              <span class="vi vi-trash-bin" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>
    </template>
  </NavBarEntity>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import NavBarEntity from '@/components/NavBarEntity.vue';
import { destruct_geo_id } from '../utils';

const store = useStore();

// TODO(multi-scene phase 2/3): replace with an `instanceId` prop resolving
// its own bound context via widgetInstances -- for now there is exactly
// one bootstrap-created geo3d context. Mirrors TransfGroupsPanel.vue /
// ItemsTree.vue.
const contextId = computed(() => store.getters['contexts/listForType']('geo3d')[0]?.id ?? null);
const view3DNS = computed(() => `view3D_${contextId.value}`);
// Generic per-context selection state (doc/ui-session.rst's "Selection
// model", store/selection.js) -- separate from view3DNS above.
const selectionNS = computed(() => `selection_${contextId.value}`);

const selectedMarkers = computed(() => store.getters[`${selectionNS.value}/selectedSubItems`]);
const geoData = computed(() => store.getters[`${view3DNS.value}/geoData`]);

// Resolves one (geoID, index) pair against the raw source payload -- the
// same `geoData` the Items Tree itself reads from (see ItemsTree.vue's
// `availableItems`) -- for a label/facets/position to show. Selection is
// expected to stay small (a handful of picks, never bulk -- see the
// per-marker-picking discussion this panel came out of), so this re-scan
// per row is cheap; it deliberately does not try to index all markers in
// the scene up front.
function resolve_marker(geoID, index) {
    const [srcID, geoItemID] = destruct_geo_id(geoID);
    const geometry = geoData.value[srcID]?.geometry?.find(g => g._name === geoItemID);
    const item = geometry?.items?.[index];
    return {
        label: geometry?._name ?? geoItemID,
        facets: geometry?._facets ?? geometry?._classifiers ?? {},
        position: item?.position ?? null
    };
}

const rows = computed(() => {
    const out = [];
    for(const [geoID, indices] of selectedMarkers.value) {
        for(const index of indices) {
            const {label, facets, position} = resolve_marker(geoID, index);
            out.push({
                geoID,
                index,
                label,
                facetEntries: Object.entries(facets),
                position
            });
        }
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}) || a.index - b.index);
    return out;
});

function fmt(n) {
    return typeof n === 'number' ? n.toFixed(2) : n;
}

function remove(geoID, index) {
    const current = new Set(selectedMarkers.value.get(geoID) ?? []);
    current.delete(index);
    if(current.size) {
        store.commit(`${selectionNS.value}/select_sub_items`, {itemID: geoID, indices: current});
    } else {
        store.commit(`${selectionNS.value}/clear_selected_sub_items`, geoID);
    }
}

function clear_all() {
    store.commit(`${selectionNS.value}/clear_selected_sub_items`);
}
</script>

<style scoped>
.empty-state {
  color: var(--clr-fg-main-muted);
  font-style: italic;
  padding: 0.3rem 0;
}

.selected-markers-widget {
  display: grid;
  gap: 0.4rem;
}

.selected-markers-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  font-size: .85rem;
}

.selected-markers-count {
  color: var(--clr-fg-main-muted);
}

.selected-markers-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
  max-height: 20rem;
  overflow-y: auto;
}

.selected-marker-row {
  position: relative;
  border: 1px solid var(--clr-border-inactive);
  border-radius: 3pt;
  padding: 4pt 24pt 4pt 6pt;
  font-size: .8rem;
}

.selected-marker-main {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-weight: 600;
}

.selected-marker-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-marker-index {
  color: var(--clr-fg-main-muted);
  font-weight: normal;
}

.selected-marker-facets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  color: var(--clr-fg-main-muted);
}

.selected-marker-position {
  font-family: monospace;
  color: var(--clr-fg-main-muted);
}

.icon-button {
  position: absolute;
  top: 2pt;
  right: 2pt;
  display: inline-grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
}
</style>
