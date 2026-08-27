<!--
  Journal viewport (doc/module-journal.rst) -- lists whatever has landed in
  this context's own sinkInbox sub-state (store/sinkInbox.js), one plain
  -text message list per origin, resolved to current data (store/
  sinkResolve.js -- sinkInbox itself only holds references, resolution is
  always live). Deliberately dumb about anything beyond `{level, message}`
  per message (doc's "Data") -- no columns, sorting, or per-message
  selection yet, same "draft, for now" scope as the module registration
  itself (index.js).
-->
<template>
  <div class="journal-viewport">
    <p v-if="!entries.length" class="journal-viewport__empty">
      Nothing routed in yet -- select a graph edge with log messages, then
      connect its scope to this one from the wiring diagram.
    </p>
    <div v-for="entry in entries" :key="entry.originContextId + ':' + entry.itemId" class="journal-viewport__entry">
      <div class="journal-viewport__entry-label">From {{ entry.originContextId }} ({{ entry.itemId }})</div>
      <p v-if="!entry.messages.length" class="journal-viewport__empty">(no messages on this item)</p>
      <ul v-else class="journal-viewport__messages">
        <li
          v-for="(msg, i) in entry.messages"
          :key="i"
          class="journal-viewport__message"
          :class="`journal-viewport__message--${msg.level ?? 'debug'}`"
        >{{ msg.message }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { resolve_incoming_sink_items } from '@/store/sinkResolve';

const props = defineProps({
    instanceId: {type: String, required: true}
});

const store = useStore();

const contextId = computed(() => store.getters['widgetInstances/instance'](props.instanceId)?.contextId ?? null);
const sinkInboxNS = computed(() => `sinkInbox_${contextId.value}`);
const incomingList = computed(() => contextId.value ? store.getters[`${sinkInboxNS.value}/incomingList`] : []);

// One entry per resolved sink item -- `snapshot.messages` is this module's
// only recognized field (doc's "Data"); anything else a producer's own
// journal payload carries is silently ignored, same "opaque passthrough,
// read only what you know" convention every other sink consumer follows.
const entries = computed(() => resolve_incoming_sink_items(store, incomingList.value).map(item => ({
    originContextId: item.originContextId,
    itemId: item.itemId,
    messages: item.snapshot?.messages ?? []
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

.journal-viewport__messages {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: var(--font-data);
}

.journal-viewport__message {
    padding: 1px 4px;
    white-space: pre-wrap;
    word-break: break-word;
}

.journal-viewport__message--debug {
    color: var(--clr-fg-panel);
}

/* A small preview of the "severity" column planned later (doc's
   "Rendering") -- an error-level message reads distinctly without waiting
   on that redesign. No dedicated "error"/"danger" token exists app-wide
   yet, so this borrows the same first categorical palette slot the
   plotter uses for its own default marker color (--clr-legend1) rather
   than inventing a new global CSS variable for one draft component. */
.journal-viewport__message--error {
    color: var(--clr-legend1);
}
</style>
