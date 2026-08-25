<!--
  Edits an existing link's facetsSelector filter in place -- either a sink
  link's (doc/ui-session.rst's "Selection sinks") or a resource->scope
  attachment's (doc/data-model.rst's "One input concept per scope, not
  two") -- reachable from SinkWiringPanel.vue's "Assign facet…" context
  menu item on either kind of edge. Both kinds share this one component
  rather than getting a copy each, the same way ConnectScopeModal.vue
  already branches on its own `kind` prop for its several modes.

  `kind: 'sink'` (default): ConnectScopeModal.vue can only ever *create* a
  new sink link (its submit() always calls contexts/create_sink_link, which
  mints a fresh linkId); this instead re-commits contexts/add_sink_link
  with the *same* linkId, a plain keyed-map write (sinkLinks[linkId] = {...})
  that overwrites the link's facetsSelector without disturbing its
  target/payloadType or minting a second link.

  `kind: 'resource'`: a resource's own facetsSelector field
  (connection.js's add_resource) has no such create/edit split to begin
  with -- it's just committed directly via connection/update_resource,
  same mechanism reassign_resource_context itself uses for `contextId`.

  Deliberately minimal either way -- a single "key = value" pair, the same
  shape ConnectScopeModal.vue's own "Only if facet" field already offers
  when *creating* a sink link. This is a stand-in for a proper
  facet-expression editor (multiple clauses, richer operators) planned for
  later; swapping that in only means replacing this one component; the
  mechanism (a plain facetsSelector object, applied via the same
  overwrite-in-place pattern either way) doesn't change.
-->
<template>
  <div class="facet-selector-modal">
    <h3>Assign facet</h3>

    <p v-if="!target" class="modal-error">{{ missingLabel }}</p>

    <form v-else @submit.prevent="submit">
      <p class="facet-selector-row">
        <label for="facet-selector-key">Only if facet</label>
        <span class="facet-selector-row__fields">
          <input id="facet-selector-key" type="text" v-model.trim="facetKey" placeholder="facet key">
          <span>=</span>
          <input type="text" v-model="facetValue" placeholder="value" :disabled="!facetKey">
        </span>
      </p>
      <p class="facet-selector-actions">
        <button type="submit">OK</button>
        <button type="button" @click="$emit('close')">Cancel</button>
      </p>
    </form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';

const props = defineProps({
    kind: {type: String, default: 'sink'}, // 'sink' | 'resource'
    // 'sink' kind:
    contextId: {type: String, default: null},
    linkId: {type: String, default: null},
    // 'resource' kind:
    resourceName: {type: String, default: null}
});
const emit = defineEmits(['close']);

const store = useStore();

const target = computed(() => props.kind === 'resource'
    ? (store.state.connection.resources[props.resourceName] ?? null)
    : (store.getters['contexts/sinkLinks'](props.contextId)[props.linkId] ?? null));

const missingLabel = props.kind === 'resource' ? 'This source no longer exists.' : 'This link no longer exists.';

const initialEntry = Object.entries(target.value?.facetsSelector ?? {})[0] ?? ['', ''];
const facetKey = ref(initialEntry[0]);
const facetValue = ref(initialEntry[1]);

function submit() {
    if(!target.value) return;
    const facetsSelector = facetKey.value ? {[facetKey.value]: facetValue.value} : null;
    if(props.kind === 'resource') {
        store.commit('connection/update_resource', {name: props.resourceName, changes: {facetsSelector}});
    } else {
        store.commit('contexts/add_sink_link', {
            contextId: props.contextId,
            linkId: props.linkId,
            targetDataType: target.value.targetDataType,
            targetContextId: target.value.targetContextId,
            payloadType: target.value.payloadType,
            facetsSelector
        });
    }
    emit('close');
}
</script>

<style scoped>
.facet-selector-modal {
  font-size: 9pt;
}

.facet-selector-modal h3 {
  margin: 0 0 0.5rem;
}

.facet-selector-row {
  margin: 4pt 0;
}

.facet-selector-row label {
  display: block;
  margin-bottom: 2pt;
  color: var(--clr-fg-main-muted);
}

.facet-selector-row__fields {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.modal-error {
  color: var(--clr-fg-main-highlighted);
}

.facet-selector-actions {
  display: flex;
  gap: 5pt;
  margin: 4pt 0;
}
</style>
