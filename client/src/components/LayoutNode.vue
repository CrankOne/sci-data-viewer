<template>
  <Panel v-if="node.type === 'leaf'" :node="node" />

  <div v-else class="layout-node">
    <splitpanes
      :horizontal="node.direction === 'column'"
      @resize="on_resize"
      @resized="on_resized"
    >
      <!-- :key is the pane's own *position* (0/1), not child.id, and
           deliberately so -- see the note below. -->
      <pane
        v-for="(child, index) in node.children"
        :key="index"
        :size="index === 0 ? node.ratio : 100 - node.ratio"
      >
        <LayoutNode v-if="child.type === 'split'" :node="child" />
        <Panel v-else :node="child" />
      </pane>
    </splitpanes>
  </div>
</template>

<script setup>
// The <pane> above is deliberately keyed on its own *index* (0/1), not
// child.id -- store/modules/layout.js's own invariant is that a 'split'
// node always has exactly 2 children, and *position* is already their real
// identity (children[0] owns node.ratio, children[1] the rest); child.id
// only names whatever currently sits in that slot. Keying on child.id
// instead sounds more "correct" but isn't: splitting or collapsing a panel
// (split_panel/collapse_child) replaces one slot's node with a
// *differently-id'd* one (a leaf wrapped into a fresh split, or a split
// collapsed back down to its surviving child) without changing which slot
// it lives in. A child.id key would make Vue treat that as "this whole
// <pane> is gone, a new one appeared" and destroy+recreate it -- and
// splitpanes' own <Pane> fires its onPaneAdd/onPaneRemove hooks (which
// rebuild its *own*, non-Vue-managed splitter-handle <div>s via raw
// insertBefore/removeChild, node_modules/splitpanes' own source) off
// exactly that mount/unmount, racing Vue's own patch of the same container
// and producing the "Node.insertBefore: Child to insert before is not a
// child of this node" crash from todo.md's "Adding a viewer" bug --
// possibly the parasitic-scrollbar one too, both downstream of the same
// spurious pane churn. Index-keying leaves the <pane> element itself
// mounted continuously across a split/collapse at this level (only the
// content inside -- the recursive LayoutNode/Panel switch, already its own
// independent v-if/v-else -- changes), so splitpanes' add/remove hooks
// only ever fire for a *genuine* new/removed splitpanes instance, never a
// same-slot content swap -- strictly less DOM churn than child.id keying
// caused before, not more.
// This relies on a split's 2 children never being *reordered* in place --
// today's mutations only ever replace one slot's content, never swap which
// slot two existing subtrees occupy. todo.md's "Swap dragged panel" sounds
// like it could be that, but isn't: layout.js's move_module/move_wiring
// implement it as swapping two *leaves'* content in place (their ids and
// slots never change), not moving subtrees between slots, so this key stays
// exactly as safe as before.
//
// That swap did surface a separate, real gap once it landed: a plain
// content-value update -- same leaf id, same content.kind, only
// content.instanceId now naming a different module -- passed down as this
// :node prop through two nested <splitpanes>/<pane> levels (both real Vue
// components, but with their own hand-written, non-compiled render()s --
// node_modules/splitpanes' own source) was silently not reaching a
// second-or-deeper-nested <Panel>: confirmed live, its own `props.node`
// stayed the stale pre-swap object indefinitely, no matter how long the
// observation window, while the store itself already held the new tree.
// Every mutation before this feature always paired a content update with a
// content.kind change too (an empty items leaf becoming a module, or vice
// versa on removal), which forces a fresh <Panel> via the v-if/v-else
// branch switch above regardless of any prop-passing gap, so this never
// surfaced before. Fixed in Panel.vue itself, not here -- it now reads its
// own content live off the store (the existing `layout/leafContent`
// getter, by this leaf's own stable id) instead of trusting `node.content`,
// which sidesteps this prop-passing gap entirely rather than working around
// one specific symptom of it.
import { useStore } from 'vuex';
import { Splitpanes, Pane } from 'splitpanes';
import Panel from './Panel.vue';

const REMOVE_THRESHOLD = 5;

const props = defineProps({
    node: {type: Object, required: true}
});

const store = useStore();

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
</style>
