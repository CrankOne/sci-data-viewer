<!--
  One cluster's bounding rect + label (doc/module-graph.rst's "Clusters"),
  positioned from dagre's own compound-graph layout (layout.js) the same
  way DiagramNode.vue's shapes are -- `cluster.x`/`cluster.y` are dagre's
  node *center* (a cluster is a node to dagre), so the rect's top-left is
  offset by half its own width/height exactly like a rect-shaped state.

  Non-interactive (doc's "Clusters": "no selection, no hover") -- no click/
  hover emits, no selected/highlighted props, unlike DiagramNode.vue/
  DiagramEdge.vue. Rendered behind the node/edge group by DiagramViewport
  .vue's own element order, not by z-index, since SVG paints in document
  order.
-->
<template>
  <g class="diagram-cluster" :transform="`translate(${cluster.x}, ${cluster.y})`">
    <rect
      :x="-cluster.width / 2" :y="-cluster.height / 2"
      :width="cluster.width" :height="cluster.height"
      class="diagram-cluster__bounds"
    />
    <text
      v-if="cluster.label"
      :x="-cluster.width / 2 + 6" :y="-cluster.height / 2 + 14"
      class="diagram-cluster__label"
    >{{ cluster.label }}</text>
  </g>
</template>

<script setup>
defineProps({
    cluster: {type: Object, required: true}
});
</script>

<style scoped>
.diagram-cluster__bounds {
    fill: var(--clr-bg-panel-header);
    fill-opacity: 0.35;
    stroke: var(--clr-border-inactive);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    rx: 6;
    ry: 6;
}

.diagram-cluster__label {
    fill: var(--clr-fg-panel-header);
    font-family: var(--font-data);
    font-size: 10px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    pointer-events: none;
    user-select: none;
}
</style>
