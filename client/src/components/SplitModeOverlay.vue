<!--
  Renders the button-triggered "split mode" affordance (AppControls.vue's
  split buttons, store/modules/ui.js's `splitMode`) -- replaces the old
  shift-drag-to-split gesture (formerly LayoutNode.vue's
  begin_shift_split). While active: hovering a panel shows a fixed line at
  its exact center, oriented per `splitMode` -- no live ratio preview,
  the split always lands 50/50 -- and a click on a panel applies
  `layout/split_panel` there; Escape cancels without splitting.

  Sits in its own Teleport-to-body layer, `pointer-events: none`, so the
  line never intercepts the mousemove/click this component itself needs
  to resolve which panel is hovered -- those are plain `window` listeners
  reading `event.target` under the overlay, not events on the overlay.
-->
<template>
  <Teleport to="body">
    <div v-if="active" class="split-mode-overlay">
      <div
        v-if="lineStyle"
        class="split-mode-line"
        :class="splitMode === 'row' ? 'split-mode-line--vertical' : 'split-mode-line--horizontal'"
        :style="lineStyle"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useStore } from 'vuex';

const store = useStore();
const splitMode = computed(() => store.state.ui.splitMode);
const active = computed(() => splitMode.value != null);

const hoveredPanelId = ref(null);
const hoveredRect = ref(null);

function resolve_panel_id(target) {
    return target?.closest?.('.panel')?.dataset?.panelId ?? null;
}

function on_mousemove(event) {
    const panelId = resolve_panel_id(event.target);
    hoveredPanelId.value = panelId;
    if(!panelId) {
        hoveredRect.value = null;
        return;
    }
    const el = document.querySelector(`.panel[data-panel-id="${CSS.escape(panelId)}"]`);
    hoveredRect.value = el ? el.getBoundingClientRect() : null;
}

// Capture phase + stopPropagation: swallows the click entirely during
// split mode so it never also reaches the panel's own handlers underneath
// (Panel.vue's shift-click "add content", a subpanel header's own
// expand/collapse toggle, ...).
function on_click(event) {
    event.preventDefault();
    event.stopPropagation();
    const panelId = resolve_panel_id(event.target);
    if(panelId) {
        store.commit('layout/split_panel', {
            targetId: panelId,
            direction: splitMode.value,
            ratio: 50,
            newPanelFirst: false
        });
    }
    store.commit('ui/exit_split_mode');
}

function on_keydown(event) {
    if(event.key === 'Escape') store.commit('ui/exit_split_mode');
}

function attach() {
    document.body.style.cursor = 'crosshair';
    window.addEventListener('mousemove', on_mousemove);
    window.addEventListener('click', on_click, true);
    window.addEventListener('keydown', on_keydown);
}

function detach() {
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', on_mousemove);
    window.removeEventListener('click', on_click, true);
    window.removeEventListener('keydown', on_keydown);
    hoveredPanelId.value = null;
    hoveredRect.value = null;
}

watch(active, value => { if(value) attach(); else detach(); }, {immediate: true});
onBeforeUnmount(detach);

const lineStyle = computed(() => {
    const r = hoveredRect.value;
    if(!r) return null;
    return splitMode.value === 'row'
        ? {left: `${r.left + r.width / 2}px`, top: `${r.top}px`, height: `${r.height}px`}
        : {top: `${r.top + r.height / 2}px`, left: `${r.left}px`, width: `${r.width}px`};
});
</script>

<style scoped>
.split-mode-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    pointer-events: none;
}

.split-mode-line {
    position: fixed;
    background: var(--clr-border-active);
}

.split-mode-line--vertical {
    width: 2px;
    transform: translateX(-1px);
}

.split-mode-line--horizontal {
    height: 2px;
    transform: translateY(-1px);
}
</style>
