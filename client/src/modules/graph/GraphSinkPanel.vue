<!--
  Side panel section (doc/module-graph.rst's "Selection and forwarding"):
  this board's own sinkInbox sub-state (store/sinkInbox.js) -- references
  routed in from another context's selection via the cross-module
  "selection sink" mechanism (doc/ui-session.rst's "Extension points").
  Lists them by origin, resolved to current data via
  resolve_incoming_sink_items (store/sinkResolve.js) -- the same
  {itemId, srcID, payloadType, snapshot} envelope every sink-dispatch
  resolveSinkItem produces (modules/registry.js), deliberately
  origin-agnostic, same as :doc:`module-table`'s real consumer.
-->
<template>
  <NavBarEntity>
    <template #header>
      Sink inbox
    </template>
    <template #actions><slot name="actions" /></template>

    <template #content>
      <div v-if="!incomingList.length" class="empty-state">
        Nothing routed in yet -- connect another scope's output to this
        board from the wiring diagram.
      </div>

      <div v-else class="graph-sink-panel">
        <div v-for="entry in incomingList" :key="entry.originContextId" class="graph-sink-panel__origin">
          <h5>From {{ entry.originContextId }} ({{ entry.payloadType }})</h5>
          <ul v-if="resolved_items(entry).length" class="graph-sink-panel__items">
            <li v-for="item in resolved_items(entry)" :key="item.itemId">
              <span class="graph-sink-panel__item-id">{{ item.itemId }}</span>
              <span class="graph-sink-panel__item-src">@{{ item.srcID }}</span>
            </li>
          </ul>
          <p v-else class="graph-sink-panel__item-missing">(nothing currently resolves)</p>
        </div>
      </div>
    </template>
  </NavBarEntity>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import NavBarEntity from '@/components/NavBarEntity.vue';
import { resolve_incoming_sink_items } from '@/store/sinkResolve';

const props = defineProps({
    itemId: {type: String, required: true}
});

const store = useStore();

const contextId = computed(() => store.getters['widgetInstances/instance'](props.itemId)?.contextId ?? null);
const sinkInboxNS = computed(() => `sinkInbox_${contextId.value}`);
const incomingList = computed(() => contextId.value ? store.getters[`${sinkInboxNS.value}/incomingList`] : []);

// Per-origin group still comes straight from raw state (its own
// originContextId/payloadType header never needs resolving); only the
// items within it are references, resolved to current data on demand
// (store/sinkResolve.js) -- an item (or the whole origin) that no longer
// resolves just isn't in this list, rather than showing a "missing" row.
function resolved_items(entry) {
    return resolve_incoming_sink_items(store, [entry]);
}
</script>

<style scoped>
.empty-state {
    color: var(--clr-fg-main-muted);
    font-style: italic;
    padding: 0.3rem 0;
}

.graph-sink-panel {
    display: grid;
    gap: 0.6rem;
}

.graph-sink-panel__origin h5 {
    margin: 0 0 0.3rem;
    color: var(--clr-fg-main-muted);
    font-weight: 600;
}

.graph-sink-panel__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
    font-size: 0.85rem;
}

.graph-sink-panel__items li {
    border: 1px solid var(--clr-border-inactive);
    border-radius: 3pt;
    padding: 3pt 6pt;
}

.graph-sink-panel__item-src {
    color: var(--clr-fg-main-muted);
}

.graph-sink-panel__item-missing {
    color: var(--clr-fg-main-highlighted);
    font-style: italic;
    margin: 0;
}
</style>
