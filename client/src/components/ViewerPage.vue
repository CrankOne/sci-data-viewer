<template>
  <splitpanes class="viewer-splitpanes">
    <pane min-size="30" size="75">
        <viewport/>
    </pane>
    <pane>
        <side-panel/>
    </pane>
  </splitpanes>
</template>

<script setup>
import { Splitpanes, Pane } from 'splitpanes';
import Viewport from './Viewport.vue';
import SidePanel from './SidePanel.vue';
</script>

<style scoped>
.viewer-splitpanes {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}
</style>
