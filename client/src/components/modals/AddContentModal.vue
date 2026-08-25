<template>
  <div class="add-content-modal">
    <h3>Add content</h3>

    <form @submit.prevent="submit_add">
      <p>
        <label for="add-content-kind">Add</label>
        <select id="add-content-kind" v-model="addKind">
          <optgroup label="Viewports" :disabled="subpanelOnly">
            <option
              v-for="m in contextualModules"
              :key="`module:${m.dataType}`"
              :value="`module:${m.dataType}`"
            >New {{ m.label }} viewport</option>
          </optgroup>
          <!-- Widgets: app-wide content that, like a module viewport, needs
               a whole empty leaf of its own (never stacks with subpanels) --
               same disablement rule as "Viewports" above, for the same
               reason (layout.js's leaf-kind split). -->
          <optgroup label="Widgets" :disabled="subpanelOnly">
            <option value="wiring">Wiring Diagram</option>
          </optgroup>
          <optgroup v-for="group in groupedSubpanelTypes" :key="group.category" :label="group.category">
            <option v-for="t in group.items" :key="t.id" :value="t.id">{{ t.title }}</option>
          </optgroup>
        </select>
      </p>
      <p v-if="addKindDataType">
        <label for="add-content-scene">Scope</label>
        <select id="add-content-scene" v-model="addContextId">
          <option value="">New scope&hellip;</option>
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
import { all_side_panel_items, CATEGORY_APP, CATEGORY_COMMON_SCOPE, CATEGORY_SCENE_3D } from '@/modules/panelItems';
import { all_modules, get_module } from '@/modules/registry';
import { create_scene_with_viewport } from '@/sceneCreation';

const props = defineProps({
    toPanelId: {type: String, required: true},
    // Shift+click on a panel that already has subpanels stacked (Panel.vue)
    // opens this same modal, but a subpanel-stack leaf can never hold a
    // module (layout.js's own leaf-kind split) -- disabling rather than
    // hiding the "Viewports" group keeps the list shape identical between
    // both entry points.
    subpanelOnly: {type: Boolean, default: false}
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

// Two-level grouping for the <select> above (doc/ui-session.rst's
// "Extension points") -- known categories first, in a fixed order, then
// whatever's left (e.g. a future module's own label-derived bucket) in
// first-seen order.
const CATEGORY_ORDER = [CATEGORY_APP, CATEGORY_COMMON_SCOPE, CATEGORY_SCENE_3D];
const groupedSubpanelTypes = computed(() => {
    const groups = new Map();
    for(const item of addableSubpanelTypes.value) {
        if(!groups.has(item.category)) groups.set(item.category, []);
        groups.get(item.category).push(item);
    }
    const orderedCategories = [
        ...CATEGORY_ORDER.filter(category => groups.has(category)),
        ...[...groups.keys()].filter(category => !CATEGORY_ORDER.includes(category))
    ];
    return orderedCategories.map(category => ({category, items: groups.get(category)}));
});

const addKind = ref(
    !props.subpanelOnly && contextualModules.value[0]
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
        } else if(addKind.value === 'wiring') {
            store.commit('layout/place_new_wiring', {toPanelId: props.toPanelId});
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
