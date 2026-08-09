<template>
  <Panel v-if="node.type === 'leaf'" :node="node" />

  <div v-else ref="wrapEl" class="layout-node" @mousedown.capture="on_splitter_mousedown_capture">
    <splitpanes
      :horizontal="node.direction === 'column'"
      @resize="on_resize"
      @resized="on_resized"
    >
      <pane
        v-for="(child, index) in node.children"
        :key="child.id"
        :size="index === 0 ? node.ratio : 100 - node.ratio"
      >
        <LayoutNode v-if="child.type === 'split'" :node="child" />
        <Panel v-else :node="child" />
      </pane>
    </splitpanes>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useStore } from 'vuex';
import { Splitpanes, Pane } from 'splitpanes';
import Panel from './Panel.vue';

const MIN_RATIO = 8;
const MAX_RATIO = 92;
const REMOVE_THRESHOLD = 5;
// Below this many pixels of total mouse movement, treat a shift+mousedown as
// an accidental click rather than an intentional split gesture.
const MIN_DRAG_PX = 4;

const props = defineProps({
    node: {type: Object, required: true}
});

const store = useStore();
const wrapEl = ref(null);

function on_resize(panes) {
    store.commit('layout/set_ratio', {splitId: props.node.id, ratio: panes[0].size});
}

function on_resized(panes) {
    for(let i = 0; i < props.node.children.length; i++) {
        const child = props.node.children[i];
        const isEmpty = child.type === 'leaf' && child.content.kind === 'items' && child.content.ids.length === 0;
        if(isEmpty && panes[i].size < REMOVE_THRESHOLD) {
            store.commit('layout/remove_panel', {emptyPanelId: child.id});
            return;
        }
    }
    store.commit('layout/set_ratio', {splitId: props.node.id, ratio: panes[0].size});
}

// Shift+drag turns a plain resize gesture into a split: intercepted here, in
// the mousedown *capture* phase, so it never reaches splitpanes' own
// (non-capturing) drag handler bound directly to the splitter element.
function on_splitter_mousedown_capture(event) {
    if(!event.target.classList?.contains('splitpanes__splitter')) return;
    if(!event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    begin_shift_split(event);
}

function begin_shift_split(startEvent) {
    const paneEls = [...wrapEl.value.querySelectorAll(':scope > .splitpanes > .splitpanes__pane')];
    if(paneEls.length !== 2) return;

    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    document.body.style.userSelect = 'none';

    function on_move(event) {
        highlight_target(event.clientX, event.clientY, paneEls);
    }

    function on_up(event) {
        window.removeEventListener('mousemove', on_move);
        window.removeEventListener('mouseup', on_up);
        document.body.style.userSelect = '';
        clear_highlight(paneEls);

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if(Math.abs(dx) < MIN_DRAG_PX && Math.abs(dy) < MIN_DRAG_PX) return;

        // Dominant axis of the whole gesture decides the new split's
        // orientation; whichever neighbor pane the cursor ends up over is
        // the one that gets split.
        const direction = Math.abs(dx) >= Math.abs(dy) ? 'row' : 'column';
        const targetIndex = pane_index_at(event.clientX, event.clientY, paneEls);
        const target = props.node.children[targetIndex];
        const rect = paneEls[targetIndex].getBoundingClientRect();

        const offset = direction === 'row'
            ? (event.clientX - rect.left) / rect.width * 100
            : (event.clientY - rect.top) / rect.height * 100;
        const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, offset));

        store.commit('layout/split_panel', {
            targetId: target.id,
            direction,
            ratio,
            newPanelFirst: offset < 50
        });
    }

    window.addEventListener('mousemove', on_move);
    window.addEventListener('mouseup', on_up);
}

function pane_index_at(clientX, clientY, paneEls) {
    const index = paneEls.findIndex(el => {
        const rect = el.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    if(index !== -1) return index;

    // Cursor ended up outside both panes (e.g. released past the window
    // edge) -- fall back to whichever pane's center is closest.
    const distances = paneEls.map(el => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.hypot(clientX - cx, clientY - cy);
    });
    return distances.indexOf(Math.min(...distances));
}

function highlight_target(clientX, clientY, paneEls) {
    const index = pane_index_at(clientX, clientY, paneEls);
    paneEls.forEach((el, i) => el.classList.toggle('shift-split-target', i === index));
}

function clear_highlight(paneEls) {
    paneEls.forEach(el => el.classList.remove('shift-split-target'));
}
</script>

<style scoped>
.layout-node {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}

:deep(.splitpanes) {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}

:deep(.shift-split-target) {
    outline: 2px dashed var(--clr-border-active);
    outline-offset: -2px;
}
</style>
