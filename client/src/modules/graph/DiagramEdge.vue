<!--
  One edge's <path> (doc/module-graph.rst's "Rendering"): a polyline
  through dagre's own routed points (edge.points, layout.js), not a
  straight line between two node centers -- what lets edges avoid crossing
  through unrelated nodes. A wide, invisible "hit" path sits under the
  visible line so a thin edge stays easy to click/hover.

  `edge.directed === false` (doc's "Edges") only ever suppresses the
  arrowhead here -- dagre itself has no undirected-layout mode, so the
  routing above is unaffected either way (that document's "Future scope").
-->
<template>
  <g
    class="diagram-edge"
    :class="{'diagram-edge--selected': selected, 'diagram-edge--highlighted': highlighted}"
    @click="$emit('select', $event)"
    @pointerenter="$emit('hover')"
    @pointerleave="$emit('unhover')"
  >
    <path :d="pathD" class="diagram-edge__hit" />
    <path :d="pathD" class="diagram-edge__line" :marker-end="markerUrl" />
    <text
      v-if="edge.label"
      :x="labelPoint.x" :y="labelPoint.y"
      class="diagram-edge__label"
      text-anchor="middle"
      dominant-baseline="middle"
    >{{ edge.label }}</text>
  </g>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    edge: {type: Object, required: true},
    selected: {type: Boolean, default: false},
    highlighted: {type: Boolean, default: false}
});
defineEmits(['select', 'hover', 'unhover']);

const pathD = computed(() =>
    props.edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')
);

const markerUrl = computed(() => {
    if(props.edge.directed === false) return null;
    if(props.selected) return 'url(#diagram-arrowhead-selected)';
    if(props.highlighted) return 'url(#diagram-arrowhead-highlighted)';
    return 'url(#diagram-arrowhead)';
});

// Point at half the polyline's own arc length -- not just its middle
// *index* -- so the label lands visually centered along the routed path
// regardless of how unevenly dagre spaced its points.
function polyline_midpoint(points) {
    if(points.length === 0) return {x: 0, y: 0};
    if(points.length === 1) return points[0];

    const segmentLengths = [];
    let total = 0;
    for(let i = 1; i < points.length; i++) {
        const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        segmentLengths.push(length);
        total += length;
    }

    let remaining = total / 2;
    for(let i = 0; i < segmentLengths.length; i++) {
        const length = segmentLengths[i];
        if(remaining <= length || i === segmentLengths.length - 1) {
            const t = length === 0 ? 0 : remaining / length;
            const p0 = points[i], p1 = points[i + 1];
            return {x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t};
        }
        remaining -= length;
    }
    return points[Math.floor(points.length / 2)];
}

const labelPoint = computed(() => polyline_midpoint(props.edge.points));
</script>

<style scoped>
.diagram-edge {
    cursor: pointer;
}

.diagram-edge__hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
}

.diagram-edge__line {
    fill: none;
    stroke: var(--clr-border-inactive);
    stroke-width: 1.5;
}

.diagram-edge--highlighted .diagram-edge__line {
    stroke: var(--clr-graph-highlight);
    stroke-width: 2;
}

.diagram-edge--selected .diagram-edge__line {
    stroke: var(--clr-graph-selection);
    stroke-width: 2.5;
}

.diagram-edge__label {
    fill: var(--clr-fg-panel);
    font-family: var(--font-data);
    font-size: 10px;
    paint-order: stroke;
    stroke: var(--clr-bg-panel);
    stroke-width: 3px;
    stroke-linejoin: round;
    pointer-events: none;
    user-select: none;
}
</style>
