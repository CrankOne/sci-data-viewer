<!--
  One node's <g> (doc/module-graph.rst's "Rendering"): shape dispatch over
  the small closed vocabulary ("Nodes" -- rect/rounded/ellipse/diamond),
  positioned via dagre's computed center (node.x/node.y, layout.js). Purely
  presentational -- hover/click are emitted upward, DiagramViewport.vue
  owns the actual selection/hover store commits (this module's shared
  `selection` context module, "Selection and forwarding").

  The label is rendered through its own dedicated <text> block, kept
  separate from the shape markup above it, deliberately -- sizing (in
  layout.js) already only cares about the label's own measured extent
  regardless of how it ends up structured, so a future multi-part shape
  (a UML class compartment, doc's "Future scope") is additive here, not a
  rework of this component's positioning.
-->
<template>
  <g
    class="diagram-node"
    :class="{'diagram-node--selected': selected, 'diagram-node--highlighted': highlighted}"
    :transform="`translate(${node.x}, ${node.y})`"
    @click="$emit('select', $event)"
    @pointerenter="$emit('hover')"
    @pointerleave="$emit('unhover')"
  >
    <rect
      v-if="shape === 'rect' || shape === 'rounded'"
      :x="-node.width / 2" :y="-node.height / 2"
      :width="node.width" :height="node.height"
      :rx="shape === 'rounded' ? 8 : 0" :ry="shape === 'rounded' ? 8 : 0"
      class="diagram-node__shape"
    />
    <ellipse
      v-else-if="shape === 'ellipse'"
      cx="0" cy="0" :rx="node.width / 2" :ry="node.height / 2"
      class="diagram-node__shape"
    />
    <polygon
      v-else
      :points="diamondPoints"
      class="diagram-node__shape"
    />

    <text class="diagram-node__label" text-anchor="middle" dominant-baseline="middle">{{ node.label }}</text>
  </g>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    node: {type: Object, required: true},
    selected: {type: Boolean, default: false},
    highlighted: {type: Boolean, default: false}
});
defineEmits(['select', 'hover', 'unhover']);

const shape = computed(() => props.node.shape ?? 'rect');

const diamondPoints = computed(() => {
    const hw = props.node.width / 2, hh = props.node.height / 2;
    return `0,${-hh} ${hw},0 0,${hh} ${-hw},0`;
});
</script>

<style scoped>
.diagram-node {
    cursor: pointer;
}

.diagram-node__shape {
    fill: var(--clr-bg-options);
    stroke: var(--clr-border-inactive);
    stroke-width: 1.5;
}

.diagram-node--highlighted .diagram-node__shape {
    stroke: var(--clr-graph-highlight);
    stroke-width: 2;
}

.diagram-node--selected .diagram-node__shape {
    fill: var(--clr-graph-selection);
    stroke: var(--clr-graph-selection);
}

.diagram-node__label {
    fill: var(--clr-fg-options);
    font-size: 11px;
    pointer-events: none;
    user-select: none;
}

.diagram-node--selected .diagram-node__label {
    fill: var(--clr-bg-main);
}
</style>
