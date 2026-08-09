<template>
  <div
    class="panel"
    :class="{'panel--drop-target': dropHover}"
    @dragover="on_panel_drag_over"
    @dragleave="on_panel_drag_leave"
    @drop="on_panel_drop"
  >
    <template v-if="node.content.kind === 'module'">
      <div v-if="activeModule" :id="'module-slot-' + node.id" class="module-slot" />
      <p v-else class="panel-empty">Load a data source to begin.</p>
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
        <component :is="item.component" :item-id="item.id" :defaultOpenedState="true" />
      </div>

      <p v-if="resolvedItems.length === 0" class="panel-empty">
        Empty panel &mdash; drag an item or the 3D view here.
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { get_module } from '@/modules/registry';
import { resolve_side_panel_item } from '@/modules/panelItems';

const props = defineProps({
    node: {type: Object, required: true}
});

const store = useStore();
const activeType = computed(() => store.getters['connection/activeType']);
const activeModule = computed(() => get_module(activeType.value));

const resolvedItems = computed(() => {
    if(props.node.content.kind !== 'items') return [];
    return props.node.content.ids
        .map(id => resolve_side_panel_item(id, activeType.value))
        .filter(Boolean);
});

const dropHover = ref(false);
// {itemId, before} -- which item's top/bottom edge is currently previewing
// an insertion point, while dragging another item over this panel's stack.
const reorderTarget = ref(null);

function drag_kind(event) {
    const types = event.dataTransfer?.types ?? [];
    if(types.includes('application/x-panel-module')) return 'module';
    if(types.includes('application/x-panel-item')) return 'item';
    return null;
}

function can_accept(kind) {
    if(kind === 'module') return props.node.content.kind === 'items' && props.node.content.ids.length === 0;
    return props.node.content.kind !== 'module';
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
        store.commit('layout/move_module', {toPanelId: props.node.id});
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
    padding: 0 3pt;
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

.panel-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    margin: 0;
    color: var(--clr-fg-main-muted);
    text-align: center;
}
</style>
