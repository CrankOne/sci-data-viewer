<!--
  Journal viewport (doc/module-journal.rst) -- lists whatever has landed in
  this context's own sinkInbox sub-state (store/sinkInbox.js), one
  JournalTree per origin, resolved to current data (store/sinkResolve.js --
  sinkInbox itself only holds references, resolution is always live).
  Deliberately dumb about anything beyond `{log, children}` per item (doc's
  "Data") -- no columns, sorting, or per-message selection yet, same
  "draft, for now" scope as the module registration itself (index.js).
-->
<template>
  <div class="journal-viewport">
    <p v-if="!entries.length" class="journal-viewport__empty">
      Nothing routed in yet -- select a graph edge with log messages, then
      connect its scope to this one from the wiring diagram.
    </p>
    <div v-for="entry in entries" :key="entry.originContextId + ':' + entry.itemId" class="journal-viewport__entry">
      <div class="journal-viewport__entry-label">From {{ entry.originContextId }} ({{ entry.itemId }})</div>
      <p v-if="!entry.tree" class="journal-viewport__empty">(no messages on this item)</p>
      <JournalTree v-else :tree="entry.tree" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { resolve_incoming_sink_items } from '@/store/sinkResolve';
import JournalTree from './JournalTree.vue';

const props = defineProps({
    instanceId: {type: String, required: true}
});

const store = useStore();

const contextId = computed(() => store.getters['widgetInstances/instance'](props.instanceId)?.contextId ?? null);
const sinkInboxNS = computed(() => `sinkInbox_${contextId.value}`);
const incomingList = computed(() => contextId.value ? store.getters[`${sinkInboxNS.value}/incomingList`] : []);

// One entry per resolved sink item -- `snapshot` itself *is* the journal
// tree root (`{log, children}`, plus `_facets`/`_kind` riding along from
// the generic sink-resolve envelope, which JournalTree simply never reads)
// -- this module's only recognized shape (doc's "Data"); anything else a
// producer's own journal payload carries is silently ignored, same
// "opaque passthrough, read only what you know" convention every other
// sink consumer follows.
const entries = computed(() => resolve_incoming_sink_items(store, incomingList.value).map(item => ({
    originContextId: item.originContextId,
    itemId: item.itemId,
    tree: item.snapshot ?? null
})));
</script>

<style scoped>
.journal-viewport {
    height: 100%;
    overflow: auto;
    padding: 8px;
    font-size: 9pt;
    background: var(--clr-bg-panel);
    color: var(--clr-fg-panel);
}

.journal-viewport__empty {
    margin: 0;
    color: var(--clr-fg-main-muted);
    font-style: italic;
}

.journal-viewport__entry {
    margin-bottom: 12px;
}

.journal-viewport__entry-label {
    margin-bottom: 4px;
    font-size: 8pt;
    color: var(--clr-fg-main-muted);
}
</style>
