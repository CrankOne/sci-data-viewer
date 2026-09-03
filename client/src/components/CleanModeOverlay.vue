<!--
  Renders the button-triggered "clean mode" affordance (AppControls.vue's
  "Clean panel" button, store/modules/ui.js's `cleanMode`) -- mirrors
  SplitModeOverlay.vue's click-a-panel gesture, replacing the old per-panel
  Remove corner button (formerly PanelResidentChrome.vue's own) with the
  same "pick a mode, then click the target panel" flow split mode already
  uses, rather than a button living on every module/wiring panel itself.

  Unlike split mode, not every panel is a valid target here: only a module
  or wiring leaf ever had a Remove button (an items-subpanel-stack panel's
  own subpanels have their own individual remove buttons already, untouched
  by this). Hovering an eligible leaf outlines it; hovering anything else
  (an items leaf, a split gutter, empty chrome) shows no outline and a
  not-allowed cursor. Clicking an eligible leaf removes it (sceneCreation
  .js's remove_module_instance for a module, layout.js's remove_wiring_leaf
  mutation for wiring) and exits clean mode; clicking anywhere ineligible is
  swallowed but leaves clean mode active, so a stray click doesn't just
  dump the user back out -- Escape is the one documented way to bail
  without removing anything.
-->
<template>
  <Teleport to="body">
    <div v-if="active" class="clean-mode-overlay">
      <div v-if="highlightStyle" class="clean-mode-highlight" :style="highlightStyle" />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { remove_module_instance } from '@/sceneCreation';

const store = useStore();
const active = computed(() => store.state.ui.cleanMode);

const hoveredPanelId = ref(null);
const hoveredRect = ref(null);

function resolve_panel_id(target) {
    return target?.closest?.('.panel')?.dataset?.panelId ?? null;
}

function content_for(panelId) {
    return panelId ? store.getters['layout/leafContent'](panelId) : null;
}

function is_eligible(content) {
    return content?.kind === 'module' || content?.kind === 'wiring';
}

function on_mousemove(event) {
    const panelId = resolve_panel_id(event.target);
    hoveredPanelId.value = panelId;
    if(!panelId) {
        hoveredRect.value = null;
        document.body.style.cursor = 'not-allowed';
        return;
    }
    const el = document.querySelector(`.panel[data-panel-id="${CSS.escape(panelId)}"]`);
    hoveredRect.value = el ? el.getBoundingClientRect() : null;
    document.body.style.cursor = is_eligible(content_for(panelId)) ? 'pointer' : 'not-allowed';
}

// Capture phase + stopPropagation, same as SplitModeOverlay.vue's on_click:
// swallows the click entirely during clean mode so it never also reaches
// the panel's own handlers underneath.
async function on_click(event) {
    event.preventDefault();
    event.stopPropagation();
    const panelId = resolve_panel_id(event.target);
    const content = content_for(panelId);

    if(content?.kind === 'module') {
        await remove_module_instance(store, content.instanceId);
        store.commit('ui/exit_clean_mode');
    } else if(content?.kind === 'wiring') {
        store.commit('layout/remove_wiring_leaf', {leafId: panelId});
        store.commit('ui/exit_clean_mode');
    }
    // An ineligible target (an items leaf, or no panel at all) does
    // nothing -- deliberately stays in clean mode, see the header comment.
}

function on_keydown(event) {
    if(event.key === 'Escape') store.commit('ui/exit_clean_mode');
}

function attach() {
    document.body.style.cursor = 'not-allowed';
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

const highlightStyle = computed(() => {
    const r = hoveredRect.value;
    if(!r || !is_eligible(content_for(hoveredPanelId.value))) return null;
    return {top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`};
});
</script>

<style scoped>
.clean-mode-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    pointer-events: none;
}

.clean-mode-highlight {
    position: fixed;
    outline: 2px dashed var(--clr-accent);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--clr-accent) 15%, transparent);
}
</style>
