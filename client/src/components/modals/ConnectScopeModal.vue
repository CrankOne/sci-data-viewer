<template>
  <div class="connect-scope-modal">
    <h3>Connect to scope</h3>

    <div v-if="kind === 'sink' && existingLinks.length" class="connect-scope-existing">
      <p class="connect-scope-existing__label">Already sending to:</p>
      <ul>
        <li v-for="link in existingLinks" :key="link.linkId">
          <span>{{ link.targetLabel }} / {{ link.targetName }} ({{ link.payloadType }})</span>
          <button type="button" class="connect-scope-existing__remove" title="Remove this link" @click="remove_link(link.linkId)">✕</button>
        </li>
      </ul>
    </div>

    <p>{{ subjectLabel }}</p>

    <form @submit.prevent="submit">
      <p v-if="kind === 'sink' && sinkTargetTypes.length > 1">
        <label for="connect-scope-type">Target module</label>
        <select id="connect-scope-type" v-model="selectedDataType">
          <option v-for="mod in sinkTargetTypes" :key="mod.dataType" :value="mod.dataType">{{ mod.label }}</option>
        </select>
      </p>
      <p>
        <label for="connect-scope-scene">Scope</label>
        <select id="connect-scope-scene" v-model="selectedContextId">
          <option value="">New scope&hellip;</option>
          <option v-for="ctx in scenesForType" :key="ctx.id" :value="ctx.id">{{ ctx.name }}</option>
        </select>
      </p>
      <p v-if="kind === 'sink' && payloadTypeOptions.length > 1">
        <label for="connect-scope-payload-type">Payload type</label>
        <select id="connect-scope-payload-type" v-model="selectedPayloadType">
          <option v-for="opt in payloadTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </p>
      <p v-if="kind === 'sink'" class="connect-scope-facets">
        <label for="connect-scope-facet-key">Only if facet (optional)</label>
        <span class="connect-scope-facets__row">
          <input id="connect-scope-facet-key" type="text" v-model.trim="facetKey" placeholder="facet key">
          <span>=</span>
          <input type="text" v-model="facetValue" placeholder="value" :disabled="!facetKey">
        </span>
      </p>
      <p v-if="error" class="modal-error">{{ error }}</p>
      <p class="connect-scope-actions">
        <button type="submit">Connect</button>
        <button type="button" @click="$emit('close')">Cancel</button>
      </p>
    </form>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { create_scene_with_viewport } from '@/sceneCreation';
import { send_selection_to_sink } from '@/store/sinkDispatch';
import { all_modules, get_module } from '@/modules/registry';

const props = defineProps({
    kind: {type: String, required: true},          // 'resource' | 'instance' | 'sink'
    name: {type: String, default: null},            // for kind === 'resource'
    instanceId: {type: String, default: null},      // for kind === 'instance'
    originContextId: {type: String, default: null}, // for kind === 'sink'
    // Which contextual dataType's scenes to offer. For kind === 'sink' this
    // is only the *initially* selected target -- every registered module
    // that declares receiveSinkMutation (modules/registry.js) is offered
    // via the "Target module" picker above, since a sink origin isn't
    // restricted to any one target type (doc/ui-session.rst's "Selection
    // sinks").
    dataType: {type: String, required: true},
    // Optional override for the default per-kind subject line below.
    label: {type: String, default: null}
});
const emit = defineEmits(['close']);
const store = useStore();

// Every module willing to be a sink target -- not just the one the caller
// happened to suggest via `dataType` (doc/module-graph.rst's/doc/module-
// plotter.rst's "Selection and forwarding": which targets exist isn't
// fixed at the call site, it's whatever's registered right now).
const sinkTargetTypes = computed(() =>
    all_modules()
        .filter(mod => mod.receiveSinkMutation)
        .map(mod => ({dataType: mod.dataType, label: mod.label ?? mod.dataType}))
);

// This origin's current outgoing links (store/modules/contexts.js's
// sinkLinks -- true N:N, doc/ui-session.rst's "Selection sinks"), shown so
// "Connect" reads as *adding one more* rather than replacing a single slot.
// Removing one here is the entire "manage existing links" affordance for
// now -- deliberately no inline edit; re-adding is one click away, and a
// proper list-and-edit UI is what the wiring diagram is for (see the
// conversation this modal predates).
const existingLinks = computed(() => {
    if(props.kind !== 'sink' || !props.originContextId) return [];
    return store.getters['contexts/linksFrom'](props.originContextId).map(link => ({
        ...link,
        targetLabel: get_module(link.targetDataType)?.label ?? link.targetDataType,
        targetName: store.getters['contexts/context'](link.targetContextId)?.name ?? link.targetContextId
    }));
});

function remove_link(linkId) {
    store.commit('contexts/remove_sink_link', {contextId: props.originContextId, linkId});
}

const selectedDataType = ref(props.dataType);
const selectedContextId = ref('');
const error = ref(null);

// The chosen target module's own closed vocabulary (modules/registry.js's
// acceptsPayloadTypes) -- never the origin's, on purpose (see registry.js's
// header comment): a link's mandatory payload type is checked against what
// the *receiver* declared it accepts, not against any producer-side list,
// since a module is free to tag items with whatever type fits per item.
// A target that accepts '*' offers exactly one synthetic "Any" option
// rather than an open text field -- still a closed, always-valid choice.
const payloadTypeOptions = computed(() => {
    const target = get_module(selectedDataType.value);
    const accepted = target?.acceptsPayloadTypes;
    if(!accepted) return [];
    return accepted === '*' ? [{value: '*', label: 'Any'}] : accepted.map(pt => ({value: pt, label: pt}));
});
const selectedPayloadType = ref(payloadTypeOptions.value[0]?.value ?? null);

const facetKey = ref('');
const facetValue = ref('');

// Switching the target module has no established scope or payload-type
// choice yet -- always reset to "New scope…" / that target's own first
// accepted type, since this form only ever *adds* a link (existingLinks
// above is where any prior link for this origin is shown/removed).
watch(selectedDataType, () => {
    selectedContextId.value = '';
    selectedPayloadType.value = payloadTypeOptions.value[0]?.value ?? null;
});

const effectiveDataType = computed(() => props.kind === 'sink' ? selectedDataType.value : props.dataType);
const scenesForType = computed(() => store.getters['contexts/listForType'](effectiveDataType.value));

const subjectLabel = computed(() => {
    if(props.label) return props.label;
    if(props.kind === 'resource') return `Assign "${props.name}" to a scope:`;
    if(props.kind === 'sink') return 'Send selection to:';
    return 'Connect this subpanel to a scope:';
});

// "New scene…" here goes through the same shared helper every other
// picker in the app uses (see sceneCreation.js) -- a scene never comes
// into existence without a viewport.
async function submit() {
    error.value = null;
    try {
        let contextId = selectedContextId.value || null;
        if(!contextId) {
            const created = await create_scene_with_viewport(store, {dataType: effectiveDataType.value});
            contextId = created.contextId;
        }

        if(props.kind === 'resource') {
            await store.dispatch('connection/reassign_resource_context', {name: props.name, contextId});
        } else if(props.kind === 'sink') {
            if(!selectedPayloadType.value) {
                throw new Error(`"${effectiveDataType.value}" declares no acceptsPayloadTypes -- cannot receive`);
            }
            // Always adds a new link (store/modules/contexts.js's true N:N
            // sinkLinks) rather than replacing one -- existingLinks above is
            // where a prior link gets removed, if that's what's wanted.
            const linkId = await store.dispatch('contexts/create_sink_link', {
                contextId: props.originContextId,
                targetDataType: effectiveDataType.value,
                targetContextId: contextId,
                payloadType: selectedPayloadType.value,
                facetsSelector: facetKey.value ? {[facetKey.value]: facetValue.value} : null
            });
            // Sends once immediately, same as before this link concept
            // existed -- store/sinkAutoDispatch.js takes over from here,
            // resending automatically on every future selection change in
            // this origin context.
            send_selection_to_sink(store, {originContextId: props.originContextId, linkId});
        } else {
            store.commit('widgetInstances/set_instance_context', {instanceId: props.instanceId, contextId});
        }

        emit('close');
    } catch(e) {
        error.value = e.message;
    }
}
</script>

<style scoped>
.connect-scope-modal {
  font-size: 9pt;
}

.connect-scope-modal h3 {
  margin: 0 0 0.5rem;
}

.connect-scope-modal p {
  margin: 4pt 0;
}

.connect-scope-modal label {
  display: block;
  margin-bottom: 2pt;
  color: var(--clr-fg-main-muted);
}

.modal-error {
  color: var(--clr-fg-main-highlighted);
}

.connect-scope-existing {
  margin-bottom: 8pt;
  padding-bottom: 6pt;
  border-bottom: 1px solid var(--clr-border-inactive);
}

.connect-scope-existing__label {
  margin: 0 0 3pt;
  color: var(--clr-fg-main-muted);
}

.connect-scope-existing ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2pt;
}

.connect-scope-existing li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6pt;
}

.connect-scope-existing__remove {
  flex: none;
}

.connect-scope-actions {
  display: flex;
  gap: 5pt;
}

.connect-scope-facets__row {
  display: flex;
  align-items: center;
  gap: 4pt;
}

.connect-scope-facets__row input {
  min-width: 0;
  flex: 1;
}
</style>
