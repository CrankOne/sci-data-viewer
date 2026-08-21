<template>
  <Panel v-if="node.type === 'leaf'" :node="node" />

  <div v-else class="layout-node">
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
