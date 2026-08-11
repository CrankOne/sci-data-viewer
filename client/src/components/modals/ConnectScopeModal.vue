<template>
  <div class="connect-scope-modal">
    <h3>Connect to scene</h3>
    <p>{{ subjectLabel }}</p>

    <form @submit.prevent="submit">
      <p>
        <label for="connect-scope-scene">Scene</label>
        <select id="connect-scope-scene" v-model="selectedContextId">
          <option value="">New scene&hellip;</option>
          <option v-for="ctx in scenesForType" :key="ctx.id" :value="ctx.id">{{ ctx.name }}</option>
        </select>
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
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { create_scene_with_viewport } from '@/sceneCreation';

const props = defineProps({
    kind: {type: String, required: true},          // 'resource' | 'instance'
    name: {type: String, default: null},            // for kind === 'resource'
    instanceId: {type: String, default: null},      // for kind === 'instance'
    dataType: {type: String, required: true},       // which contextual dataType's scenes to offer
    currentContextId: {type: String, default: null}
});
const emit = defineEmits(['close']);
const store = useStore();

const selectedContextId = ref(props.currentContextId ?? '');
const error = ref(null);

const scenesForType = computed(() => store.getters['contexts/listForType'](props.dataType));

const subjectLabel = computed(() => props.kind === 'resource'
    ? `Assign "${props.name}" to a scene:`
    : `Connect this subpanel to a scene:`);

// "New scene…" here goes through the same shared helper every other
// picker in the app uses (see sceneCreation.js) -- a scene never comes
// into existence without a viewport.
async function submit() {
    error.value = null;
    try {
        let contextId = selectedContextId.value || null;
        if(!contextId) {
            const created = await create_scene_with_viewport(store, {dataType: props.dataType});
            contextId = created.contextId;
        }

        if(props.kind === 'resource') {
            await store.dispatch('connection/reassign_resource_context', {name: props.name, contextId});
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
  font-family: monospace;
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
</style>
