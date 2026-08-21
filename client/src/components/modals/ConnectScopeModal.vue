<template>
  <div class="connect-scope-modal">
    <h3>Connect to scope</h3>
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
    currentContextId: {type: String, default: null},
    // Pre-fills the payload-type/facets-selector fields when reopening this
    // modal for a link that already exists (store/modules/contexts.js's
    // sinkTargets[dataType]) -- both ignored unless they line up with the
    // *initial* dataType, same reasoning as currentContextId below.
    currentPayloadType: {type: String, default: null},
    currentFacetsSelector: {type: Object, default: null},
    // Optional, for kind === 'sink' only: overrides send_selection_to_sink
    // (store/sinkDispatch.js) -- a caller whose dispatch isn't "the
    // origin's current selection" (e.g. modules/table/'s plot column-
    // projection dispatch) supplies its own (store, {originContextId,
    // targetDataType}) => void here instead. Still goes through
    // deliver_to_sink's own payloadType/facetsSelector filtering -- only
    // *how the items are built* is overridden, not delivery.
    dispatchFn: {type: Function, default: null},
    // Optional override for the default per-kind subject line below --
    // dispatchFn callers typically want one, since "Send selection to:" is
    // inaccurate for a non-selection payload.
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

const selectedDataType = ref(props.dataType);
const selectedContextId = ref(props.currentContextId ?? '');
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
const selectedPayloadType = ref(props.currentPayloadType ?? payloadTypeOptions.value[0]?.value ?? null);

const initialFacetEntry = Object.entries(props.currentFacetsSelector ?? {})[0] ?? ['', ''];
const facetKey = ref(initialFacetEntry[0]);
const facetValue = ref(initialFacetEntry[1]);

// currentContextId/currentPayloadType only make sense for the initially-
// suggested dataType -- switching the target module has no established
// scope or prior payload-type choice yet, so default back to "New scope…"
// / this new target's own first accepted type, rather than carrying over
// values that belonged to a different link.
watch(selectedDataType, (next, prev) => {
    if(next === prev) return;
    selectedContextId.value = next === props.dataType ? (props.currentContextId ?? '') : '';
    selectedPayloadType.value = next === props.dataType
        ? (props.currentPayloadType ?? payloadTypeOptions.value[0]?.value ?? null)
        : (payloadTypeOptions.value[0]?.value ?? null);
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
            store.commit('contexts/set_sink_target', {
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
            (props.dispatchFn ?? send_selection_to_sink)(store, {originContextId: props.originContextId, targetDataType: effectiveDataType.value});
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
