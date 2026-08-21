<!--
  Always-present draggable strip pinned to the extreme left edge of the
  viewport -- guarantees the user is never stuck unable to create a new
  panel column, regardless of how the current layout tree is nested (doc/
  ui-session.rst's layout tree has no other edge that's always reachable
  once every existing panel is already occupied). Unlike
  SplitModeOverlay.vue's button-triggered split mode, this keeps the old
  live-drag feel -- a line follows the cursor during the drag, committed on
  release -- since it's a direct manipulation of screen position (a
  fraction of window width) rather than "which panel is this."
-->
<template>
  <div
    class="left-edge-split-handle"
    title="Drag to create a new panel column"
    @mousedown="on_mousedown"
  />
  <div v-if="dragging" class="left-edge-split-line" :style="{left: lineX + 'px'}" />
</template>

<script setup>
import { ref } from 'vue';
import { useStore } from 'vuex';

const MIN_RATIO = 8;
const MAX_RATIO = 92;

const store = useStore();
const dragging = ref(false);
const lineX = ref(0);

function on_mousedown(event) {
    if(event.button !== 0) return;
    event.preventDefault();
    dragging.value = true;
    lineX.value = event.clientX;
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', on_move);
    window.addEventListener('mouseup', on_up);
}

function on_move(event) {
    lineX.value = event.clientX;
}

function on_up(event) {
    window.removeEventListener('mousemove', on_move);
    window.removeEventListener('mouseup', on_up);
    document.body.style.userSelect = '';
    dragging.value = false;

    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, event.clientX / window.innerWidth * 100));
    store.commit('layout/split_panel', {
        targetId: store.state.layout.root.id,
        direction: 'row',
        ratio,
        newPanelFirst: true
    });
}
</script>

<style scoped>
.left-edge-split-handle {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 800;
    background: transparent;
}

.left-edge-split-handle:hover {
    background: var(--clr-border-active);
    opacity: 0.6;
}

.left-edge-split-line {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--clr-border-active);
    z-index: 800;
    pointer-events: none;
}
</style>
