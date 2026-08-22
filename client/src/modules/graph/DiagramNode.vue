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
    <!-- UML pseudostate shapes (doc's "Pseudostate shapes") -- fixed-size
         (layout.js), no text label (see hasLabel below). -->
    <circle
      v-else-if="shape === 'circle-filled'"
      cx="0" cy="0" :r="node.width / 2"
      class="diagram-node__shape diagram-node__shape--solid"
    />
    <g v-else-if="shape === 'circle-ringed'">
      <circle cx="0" cy="0" :r="node.width / 2" class="diagram-node__shape" />
      <circle cx="0" cy="0" :r="node.width / 2 - 4" class="diagram-node__shape diagram-node__shape--solid" />
    </g>
    <rect
      v-else-if="shape === 'bar'"
      :x="-node.width / 2" :y="-node.height / 2"
      :width="node.width" :height="node.height"
      class="diagram-node__shape diagram-node__shape--solid"
    />
    <g v-else-if="shape === 'terminate'">
      <circle cx="0" cy="0" :r="node.width / 2" class="diagram-node__shape" />
      <line :x1="-crossExtent" :y1="-crossExtent" :x2="crossExtent" :y2="crossExtent" class="diagram-node__terminate-mark" />
      <line :x1="-crossExtent" :y1="crossExtent" :x2="crossExtent" :y2="-crossExtent" class="diagram-node__terminate-mark" />
    </g>
    <polygon
      v-else
      :points="diamondPoints"
      class="diagram-node__shape"
    />

    <text v-if="hasLabel" class="diagram-node__label" text-anchor="middle" dominant-baseline="middle">{{ node.label }}</text>
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

// The four UML pseudostate shapes carry no meaningful state name (doc's
// "Pseudostate shapes") -- suppressed here rather than by the source
// omitting `label`, so the field stays available for hover/selection/sink
// forwarding regardless.
const PSEUDOSTATE_SHAPES = ['circle-filled', 'circle-ringed', 'bar', 'terminate'];
const hasLabel = computed(() => !PSEUDOSTATE_SHAPES.includes(shape.value));

const diamondPoints = computed(() => {
    const hw = props.node.width / 2, hh = props.node.height / 2;
    return `0,${-hh} ${hw},0 0,${hh} ${-hw},0`;
});

// Diagonal half-extent of the terminate mark's cross, inscribed inside the
// circle with a small margin so the strokes don't touch the ring.
const crossExtent = computed(() => (props.node.width / 2) * 0.5);
</script>

<style scoped>
.diagram-node {
    cursor: pointer;
}

.diagram-node__shape {
    fill: var(--clr-bg-panel);
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

/* UML pseudostate shapes that are always solid-filled (initial circle,
   fork/join bar, the inner dot of a final circle) rather than the hollow
   panel-background fill every other shape defaults to -- overridden by the
   selected-state rule above when applicable, same as any other shape. */
.diagram-node__shape--solid {
    fill: var(--clr-fg-options);
    stroke: none;
}

.diagram-node__terminate-mark {
    stroke: var(--clr-border-inactive);
    stroke-width: 1.5;
    pointer-events: none;
}

.diagram-node--highlighted .diagram-node__terminate-mark {
    stroke: var(--clr-graph-highlight);
}

.diagram-node--selected .diagram-node__terminate-mark {
    stroke: var(--clr-graph-selection);
}

.diagram-node__label {
    fill: var(--clr-fg-options);
    font-family: var(--font-data);
    font-size: 11px;
    pointer-events: none;
    user-select: none;
}

.diagram-node--selected .diagram-node__label {
    fill: var(--clr-bg-main);
}
</style>
