<template>
  <div
    class="panel"
    :class="{'panel--drop-target': dropHover}"
    :data-panel-id="node.id"
    @dragover="on_panel_drag_over"
    @dragleave="on_panel_drag_leave"
    @drop="on_panel_drop"
    @click="on_panel_click"
  >
    <template v-if="node.content.kind === 'module'">
      <PanelResidentChrome
        drag-type="application/x-panel-module"
        :drag-payload="node.content.instanceId"
      >
        <div :id="'module-slot-' + node.id" class="module-slot" />
      </PanelResidentChrome>
    </template>

    <template v-else-if="node.content.kind === 'wiring'">
      <PanelResidentChrome
        drag-type="application/x-panel-wiring"
        :drag-payload="node.id"
      >
        <template #toolbar>
          <CreateScopeToolbar />
        </template>
        <SinkWiringPanel />
      </PanelResidentChrome>
    </template>

    <template v-else>
      <div
        v-for="item in resolvedItems"
        :key="item.id"
        class="panel-item"
        :class="{
          'panel-item--drop-before': reorderTarget?.itemId === item.id && reorderTarget.before,
          'panel-item--drop-after': reorderTarget?.itemId === item.id && !reorderTarget.before
        }"
        @dragover="on_item_drag_over($event, item)"
        @dragleave="on_item_drag_leave(item)"
        @drop="on_item_drop($event, item)"
      >
        <component :is="item.component" :item-id="item.id" :defaultOpenedState="true">
          <template #actions>
            <button
              v-if="item.contextualDataType"
              type="button"
              class="header-action"
              title="Connect to scope"
              aria-label="Connect to scope"
              @click="open_connect_scope(item)"
            >
              <span class="vi vi-cube" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="header-action"
              title="Remove subpanel"
              aria-label="Remove subpanel"
              @click="remove_item(item.id)"
            >
              <span class="vi vi-trash-bin" aria-hidden="true" />
            </button>
          </template>
        </component>
      </div>

      <div
        v-if="resolvedItems.length === 0"
        class="panel-empty-wrap"
        @click="on_empty_panel_click"
      >
        <p class="panel-empty-hint">Shift-click to add a new item, or drag existing here.</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { resolve_item_type } from '@/modules/panelItems';
import { all_modules } from '@/modules/registry';
import PanelResidentChrome from './PanelResidentChrome.vue';
import SinkWiringPanel from './SinkWiringPanel.vue';
import CreateScopeToolbar from './CreateScopeToolbar.vue';

const props = defineProps({
    node: {type: Object, required: true}
});

const store = useStore();

// The dataType of the contextual module owning `itemType`, or null if
// `itemType` isn't a subpanel type for a contextual module (e.g. a core
// item like Data Sources) -- used to decide whether a "connect to scene"
// button applies to a given resolved item.
function owning_contextual_data_type(itemType) {
    for(const mod of all_modules()) {
        if((mod.sidePanelSections ?? []).some(section => section.id === itemType))
            return mod.contextual ? mod.dataType : null;
    }
    return null;
}

// props.node.content.ids are widget-instance ids (see
// store/modules/widgetInstances.js); resolve each to its component/title
// via the itemType it was created with. `id` here stays the instance id
// (not the item type) so drag-reordering below keeps operating on the same
// ids layout.js's `ids` array holds.
const resolvedItems = computed(() => {
    if(props.node.content.kind !== 'items') return [];
    return props.node.content.ids
        .map(instanceId => {
            const instance = store.getters['widgetInstances/instance'](instanceId);
            const catalogEntry = instance ? resolve_item_type(instance.itemType) : null;
            if(!catalogEntry) return null;
            return {
                id: instanceId,
                component: catalogEntry.component,
                title: catalogEntry.title,
                contextualDataType: owning_contextual_data_type(instance.itemType),
                contextId: instance.contextId
            };
        })
        .filter(Boolean);
});

const dropHover = ref(false);
// {itemId, before} -- which item's top/bottom edge is currently previewing
// an insertion point, while dragging another item over this panel's stack.
const reorderTarget = ref(null);

// Shift-click on an empty panel opens the add-content modal (see
// components/modals/AddContentModal.vue) -- a plain click does nothing,
// leaving room for e.g. text selection without accidentally opening it.
function on_empty_panel_click(event) {
    if(!event.shiftKey) return;
    store.commit('ui/open_modal', {name: 'add-content', props: {toPanelId: props.node.id}});
}

// Shift-click on the *unoccupied* area of a panel that already has
// subpanels stacked -- same "add content" modal the empty-panel case above
// opens, but restricted to subpanel types: a subpanel-stack leaf can never
// hold a module (layout.js's own leaf-kind split), so the "Viewports"
// group is disabled rather than offered (AddContentModal.vue's
// `subpanelOnly` prop). Bails out for an empty panel (the handler above
// already covers it, unrestricted) and for a click landing on an actual
// item (its own header handles that, e.g. the expand/collapse toggle).
function on_panel_click(event) {
    if(!event.shiftKey) return;
    if(props.node.content.kind !== 'items' || resolvedItems.value.length === 0) return;
    if(event.target.closest('.panel-item')) return;
    store.commit('ui/open_modal', {name: 'add-content', props: {toPanelId: props.node.id, subpanelOnly: true}});
}

function open_connect_scope(item) {
    store.commit('ui/open_modal', {
        name: 'connect-scope',
        props: {
            kind: 'instance',
            instanceId: item.id,
            dataType: item.contextualDataType,
            currentContextId: item.contextId
        }
    });
}

//
// Removing already-placed content. Always a deliberate, explicit action
// (see layout.js's clear_instance_from_leaf vs. the occupied-panel collapse
// guard on ordinary drag/resize mechanics).

function remove_item(instanceId) {
    store.commit('layout/clear_instance_from_leaf', {instanceId});
    store.commit('widgetInstances/remove_instance', instanceId);
}

// A module leaf's or wiring leaf's own removal (formerly a PanelResidentChrome
// corner button here) now goes through CleanModeOverlay.vue's click-a-panel
// gesture instead -- see sceneCreation.js's remove_module_instance and
// layout.js's remove_wiring_leaf mutation, which that overlay calls directly
// by resolving the clicked panel's own content off the store rather than
// through a Panel.vue instance's props.

function drag_kind(event) {
    const types = event.dataTransfer?.types ?? [];
    if(types.includes('application/x-panel-module')) return 'module';
    if(types.includes('application/x-panel-wiring')) return 'wiring';
    if(types.includes('application/x-panel-item')) return 'item';
    return null;
}

function can_accept(kind) {
    if(kind === 'module' || kind === 'wiring') return props.node.content.kind === 'items' && props.node.content.ids.length === 0;
    return props.node.content.kind !== 'module' && props.node.content.kind !== 'wiring';
}

// Panel-level handlers: module drops, and item drops that land outside any
// specific item (empty space below the last item, or an empty panel) --
// those always append at the end. Per-item handlers below (which
// stopPropagation) take over whenever the cursor is over a specific item, to
// support reordering.

function on_panel_drag_over(event) {
    const kind = drag_kind(event);
    if(!kind || !can_accept(kind)) {
        dropHover.value = false;
        return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropHover.value = true;
}

function on_panel_drag_leave() {
    dropHover.value = false;
}

function on_panel_drop(event) {
    const kind = drag_kind(event);
    dropHover.value = false;
    if(!kind || !can_accept(kind)) return;
    event.preventDefault();

    if(kind === 'module') {
        const instanceId = event.dataTransfer.getData('application/x-panel-module');
        store.commit('layout/move_module', {toPanelId: props.node.id, instanceId});
    } else if(kind === 'wiring') {
        const fromLeafId = event.dataTransfer.getData('application/x-panel-wiring');
        store.commit('layout/move_wiring', {fromLeafId, toPanelId: props.node.id});
    } else {
        const itemId = event.dataTransfer.getData('application/x-panel-item');
        store.commit('layout/move_item', {itemId, toPanelId: props.node.id, beforeItemId: null});
    }
}

function on_item_drag_over(event, item) {
    if(drag_kind(event) !== 'item') return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    const rect = event.currentTarget.getBoundingClientRect();
    const before = (event.clientY - rect.top) < rect.height / 2;
    reorderTarget.value = {itemId: item.id, before};
}

function on_item_drag_leave(item) {
    if(reorderTarget.value?.itemId === item.id) reorderTarget.value = null;
}

function on_item_drop(event, item) {
    if(drag_kind(event) !== 'item') return;
    event.preventDefault();
    event.stopPropagation();

    const itemId = event.dataTransfer.getData('application/x-panel-item');
    const before = reorderTarget.value?.itemId === item.id ? reorderTarget.value.before : true;
    reorderTarget.value = null;

    const beforeItemId = before
        ? item.id
        : resolvedItems.value[resolvedItems.value.findIndex(i => i.id === item.id) + 1]?.id ?? null;

    store.commit('layout/move_item', {itemId, toPanelId: props.node.id, beforeItemId});
}
</script>

<style scoped>
.panel {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
}

.panel--drop-target {
    outline: 2px dashed var(--clr-border-active);
    outline-offset: -2px;
}

.module-slot {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}

.panel-item {
    position: relative;
}

.panel-item--drop-before::before,
.panel-item--drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--clr-border-active);
}

.panel-item--drop-before::before {
    top: 0;
}

.panel-item--drop-after::after {
    bottom: 0;
}

.panel-empty-wrap {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 0.5rem;
    cursor: default;
}

.panel-empty-hint {
    margin: 0;
    color: var(--clr-fg-main-muted);
    opacity: 0.6;
    text-align: center;
    font-style: italic;
}
</style>
