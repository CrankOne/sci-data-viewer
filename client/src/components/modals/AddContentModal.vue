<template>
  <div class="add-content-modal">
    <h3>Add content</h3>

    <form @submit.prevent="submit_add">
      <p>
        <label for="add-content-kind">Add</label>
        <select id="add-content-kind" v-model="addKind">
          <option v-if="contextualModule" value="module">New viewport</option>
          <option v-for="t in addableSubpanelTypes" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </p>
      <p v-if="addKindIsContextual">
        <label for="add-content-scene">Scene</label>
        <select id="add-content-scene" v-model="addContextId">
          <option value="">New scene&hellip;</option>
          <option v-for="ctx in contextsForAddKind" :key="ctx.id" :value="ctx.id">{{ ctx.name }}</option>
        </select>
      </p>
      <p v-if="error" class="modal-error">{{ error }}</p>
      <p class="add-content-actions">
        <button type="submit">Add</button>
        <button type="button" @click="$emit('close')">Cancel</button>
      </p>
    </form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { all_side_panel_items } from '@/modules/panelItems';
import { all_modules } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';

const props = defineProps({
    toPanelId: {type: String, required: true}
});
const emit = defineEmits(['close']);

const store = useStore();

// v1 supports a single contextual module type (today: geo3d) offering a
// viewport; a future second one would need a type picker here too.
const contextualModule = all_modules().find(mod => mod.contextual) ?? null;
const addableSubpanelTypes = computed(() => all_side_panel_items());

const addKind = ref(contextualModule ? 'module' : (addableSubpanelTypes.value[0]?.id ?? ''));
const addContextId = ref(''); // '' means "create a new scene"
const error = ref(null);

const addKindIsContextual = computed(() => {
    if(!contextualModule) return false;
    if(addKind.value === 'module') return true;
    return (contextualModule.sidePanelSections ?? []).some(section => section.id === addKind.value);
});

const contextsForAddKind = computed(() => {
    if(!contextualModule) return [];
    return store.getters['contexts/listForType'](contextualModule.dataType);
});

async function submit_add() {
    if(!addKind.value) return;
    error.value = null;

    try {
        let contextId = addContextId.value || null;

        if(addKind.value === 'module') {
            // A brand-new viewport goes straight into the panel that
            // opened this modal; a "New scene" choice here places its
            // viewport there too (targetPanelId), rather than
            // sceneCreation's usual wrap-the-tree fallback -- that's what
            // this empty panel is *for*.
            if(!contextId) {
                const created = await create_scene_with_viewport(store, {
                    dataType: contextualModule.dataType,
                    targetPanelId: props.toPanelId
                });
                contextId = created.contextId;
            } else {
                const instanceId = await store.dispatch('widgetInstances/create_instance', {
                    itemType: `${contextualModule.dataType}:module`,
                    contextId
                });
                store.commit('cameras/register_viewport', {viewportID: instanceId});
                store.commit('layout/place_new_module', {toPanelId: props.toPanelId, instanceId});
            }
        } else {
            // The subpanel itself goes into this panel; a "New scene"
            // choice has no natural spot for the new *viewport* here, so
            // it's auto-placed via sceneCreation's wrap-the-tree fallback.
            if(addKindIsContextual.value && !contextId) {
                const created = await create_scene_with_viewport(store, {dataType: contextualModule.dataType});
                contextId = created.contextId;
            }
            const instanceId = await store.dispatch('widgetInstances/create_instance', {
                itemType: addKind.value,
                contextId
            });
            store.commit('layout/insert_new_item', {toPanelId: props.toPanelId, instanceId});
        }

        emit('close');
    } catch(e) {
        error.value = e.message;
    }
}
</script>

<style scoped>
.add-content-modal {
  font-family: monospace;
  font-size: 9pt;
}

.add-content-modal h3 {
  margin: 0 0 0.5rem;
}

.add-content-modal p {
  margin: 4pt 0;
}

.add-content-modal label {
  display: block;
  margin-bottom: 2pt;
  color: var(--clr-fg-main-muted);
}

.modal-error {
  color: var(--clr-fg-main-highlighted);
}

.add-content-actions {
  display: flex;
  gap: 5pt;
}
</style>
