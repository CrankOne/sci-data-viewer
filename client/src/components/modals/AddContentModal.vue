<template>
  <div class="add-content-modal">
    <h3>Add content</h3>

    <form @submit.prevent="submit_add">
      <p>
        <label for="add-content-kind">Add</label>
        <select id="add-content-kind" v-model="addKind">
          <option
            v-for="m in contextualModules"
            :key="`module:${m.dataType}`"
            :value="`module:${m.dataType}`"
          >New {{ m.label }} viewport</option>
          <option v-for="t in addableSubpanelTypes" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </p>
      <p v-if="addKindDataType">
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
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { all_side_panel_items } from '@/modules/panelItems';
import { all_modules, get_module } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';

const props = defineProps({
    toPanelId: {type: String, required: true}
});
const emit = defineEmits(['close']);

const store = useStore();

// Every contextual module offers a "new viewport" option, encoded as
// `module:<dataType>` in addKind below -- namespaced under a literal
// "module:" prefix so it can't collide with a subpanel id, which already
// uses a bare colon of its own (modules/panelItems.js's
// "<dataType>:<section-id>" convention, see addKindDataType below).
const contextualModules = computed(() => all_modules().filter(mod => mod.contextual));
const addableSubpanelTypes = computed(() => all_side_panel_items());

const addKind = ref(
    contextualModules.value[0]
        ? `module:${contextualModules.value[0].dataType}`
        : (addableSubpanelTypes.value[0]?.id ?? '')
);
const addContextId = ref(''); // '' means "create a new scene"
const error = ref(null);

// A stale scene choice from a previously-selected, different dataType
// would otherwise linger and not match any option in the new list.
watch(addKind, () => { addContextId.value = ''; });

// Resolves which dataType (if any) `addKind` needs a scene for -- either
// the explicitly chosen contextual module ("module:<dataType>"), or the
// owning module of a chosen subpanel, recovered from its id's
// "<dataType>:<section-id>" prefix -- only if that prefix actually names a
// registered *contextual* module (a "core:*" subpanel's prefix, or a
// future non-contextual module's, isn't).
const addKindDataType = computed(() => {
    if(addKind.value.startsWith('module:'))
        return addKind.value.slice('module:'.length);
    const [prefix] = addKind.value.split(':');
    return get_module(prefix)?.contextual ? prefix : null;
});

const contextsForAddKind = computed(() => {
    if(!addKindDataType.value) return [];
    return store.getters['contexts/listForType'](addKindDataType.value);
});

async function submit_add() {
    if(!addKind.value) return;
    error.value = null;

    try {
        let contextId = addContextId.value || null;

        if(addKind.value.startsWith('module:')) {
            const dataType = addKindDataType.value;
            // A brand-new viewport goes straight into the panel that
            // opened this modal; a "New scene" choice here places its
            // viewport there too (targetPanelId), rather than
            // sceneCreation's usual wrap-the-tree fallback -- that's what
            // this empty panel is *for*.
            if(!contextId) {
                const created = await create_scene_with_viewport(store, {
                    dataType,
                    targetPanelId: props.toPanelId
                });
                contextId = created.contextId;
            } else {
                const instanceId = await store.dispatch('widgetInstances/create_instance', {
                    itemType: `${dataType}:module`,
                    contextId
                });
                store.commit('cameras/register_viewport', {viewportID: instanceId});
                store.commit('layout/place_new_module', {toPanelId: props.toPanelId, instanceId});
            }
        } else {
            // The subpanel itself goes into this panel; a "New scene"
            // choice has no natural spot for the new *viewport* here, so
            // it's auto-placed via sceneCreation's wrap-the-tree fallback.
            if(addKindDataType.value && !contextId) {
                const created = await create_scene_with_viewport(store, {dataType: addKindDataType.value});
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
