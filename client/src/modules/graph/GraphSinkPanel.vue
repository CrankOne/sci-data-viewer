<!--
  Side panel section (doc/module-graph.rst's "Selection and forwarding"):
  this board's own sinkInbox sub-state (store/sinkInbox.js) -- items routed
  in from another context's selection via the cross-module "selection sink"
  mechanism (doc/ui-session.rst's "Extension points"). Lists them by
  origin, the same {itemId, srcID, snapshot} envelope every sink-dispatch
  snapshot builder produces (store/sinkDispatch.js) -- deliberately
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
        Nothing routed in yet -- another module's "Send selection to sink"
        can target this board.
      </div>

      <div v-else class="graph-sink-panel">
        <div v-for="entry in incomingList" :key="entry.originContextId" class="graph-sink-panel__origin">
          <h5>From {{ entry.originContextId }} ({{ entry.type }})</h5>
          <ul class="graph-sink-panel__items">
            <li v-for="(item, index) in entry.items" :key="`${entry.originContextId}-${index}`">
              <span class="graph-sink-panel__item-id">{{ item.itemId }}</span>
              <span class="graph-sink-panel__item-src">@{{ item.srcID }}</span>
              <span v-if="!item.snapshot" class="graph-sink-panel__item-missing">(no snapshot)</span>
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
const sinkInboxNS = computed(() => `sinkInbox_${contextId.value}`);
const incomingList = computed(() => contextId.value ? store.getters[`${sinkInboxNS.value}/incomingList`] : []);
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
    margin-left: 0.4rem;
}
</style>
