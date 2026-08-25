<!--
  Bare-bones, unstyled viewport for the "sink-view" dev stub
  (modules/sink-view/index.js) -- lists whatever has landed in this
  context's own sinkInbox sub-state, resolved to current data (store/
  sinkResolve.js -- sinkInbox itself only holds references). Exists only
  to prove the cross-module "selection sink" mechanism end to end, not as
  a real consumer -- see index.js's header comment.
-->
<template>
  <div class="sink-viewport">
    <h4>Sink inbox (dev stub)</h4>
    <p v-if="!incomingList.length">Nothing routed in yet.</p>
    <div v-for="entry in incomingList" :key="entry.originContextId" class="sink-viewport__entry">
      <h5>From {{ entry.originContextId }} ({{ entry.payloadType }})</h5>
      <pre>{{ JSON.stringify(resolved_items(entry), null, 2) }}</pre>
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
const ns = computed(() => `sinkInbox_${contextId.value}`);
const incomingList = computed(() => contextId.value ? store.getters[`${ns.value}/incomingList`] : []);

function resolved_items(entry) {
    return resolve_incoming_sink_items(store, [entry]);
}
</script>

<style scoped>
.sink-viewport {
    height: 100%;
    overflow: auto;
    padding: 8px;
    font-size: 9pt;
    background: var(--clr-bg-panel);
    color: var(--clr-fg-panel);
}

.sink-viewport__entry {
    margin-bottom: 12px;
}

.sink-viewport pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 8pt;
}
</style>
