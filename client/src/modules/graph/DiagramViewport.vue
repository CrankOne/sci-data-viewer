<!--
  Block diagram viewport (doc/module-graph.rst), registered via
  modules/graph/index.js as the "graph" data type's viewportComponent
  (doc/ui-session.rst's "Extension points").

  Reads this instance's board (nodes/edges merged across every attached
  resource, store/graphBoard.js) and this *diagram*'s own persisted layout
  options (store/graphLayout.js, doc's "Diagrams"), recomputes dagre layout
  (layout.js) reactively, and renders the result as plain SVG -- DiagramNode
  .vue/DiagramEdge.vue own presentation only, this component owns pan/zoom,
  the layout toolbar, and every store commit (selection/hover, doc's
  "Selection and forwarding").
-->
<template>
  <div class="diagram-viewport">
    <div ref="hostEl" class="diagram-viewport__canvas">
      <div class="diagram-viewport__toolbar toolbar-floating">
        <div class="button-group">
          <ActionSelect
            label="Layout direction"
            :title="`Layout direction: ${directionLabel}`"
            :model-value="layoutOptions.direction"
            :options="directionOptions"
            @select="set_direction"
          />
          <ActionSelect
            label="Alignment"
            :title="`Alignment: ${alignLabel}`"
            :model-value="layoutOptions.align ?? ''"
            :options="alignOptions"
            @select="set_align"
          />
        </div>

        <button type="button" class="icon-button" title="Fit diagram to view" @click="fit_to_view">
          <span class="vi vi-frame-selected" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="icon-button"
          title="Clear selection"
          :disabled="selectedIDs.size === 0"
          @click="clear_selection"
        >
          <span class="vi vi-clear-selection" aria-hidden="true" />
        </button>
      </div>

      <svg
        ref="svgEl"
        :width="width" :height="height"
        @wheel.prevent="on_wheel"
        @pointerdown="on_pointer_down"
        @pointermove="on_pointer_move"
        @pointerup="on_pointer_up"
        @pointercancel="on_pointer_cancel"
        @lostpointercapture="on_pointer_cancel"
        @dblclick="fit_to_view"
      >
        <defs>
          <marker id="diagram-arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
                   markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="diagram-viewport__arrow" />
          </marker>
          <marker id="diagram-arrowhead-highlighted" viewBox="0 0 10 10" refX="9" refY="5"
                   markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="diagram-viewport__arrow diagram-viewport__arrow--highlighted" />
          </marker>
          <marker id="diagram-arrowhead-selected" viewBox="0 0 10 10" refX="9" refY="5"
                   markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="diagram-viewport__arrow diagram-viewport__arrow--selected" />
          </marker>
        </defs>

        <rect
          class="diagram-viewport__background"
          x="0" y="0" :width="width" :height="height"
        />

        <g :transform="to_svg_transform(transform)">
          <DiagramCluster
            v-for="cluster in layoutResult.clusters"
            :key="cluster.compositeId"
            :cluster="cluster"
          />
          <DiagramEdge
            v-for="edge in layoutResult.edges"
            :key="edge.compositeId"
            :edge="edge"
            :selected="selectedIDs.has(edge.compositeId)"
            :highlighted="highlightedIDs.has(edge.compositeId)"
            @select="on_select(edge.compositeId, $event)"
            @hover="on_hover(edge.compositeId)"
            @unhover="on_unhover"
          />
          <DiagramNode
            v-for="node in layoutResult.nodes"
            :key="node.compositeId"
            :node="node"
            :selected="selectedIDs.has(node.compositeId)"
            :highlighted="highlightedIDs.has(node.compositeId)"
            @select="on_select(node.compositeId, $event)"
            @hover="on_hover(node.compositeId)"
            @unhover="on_unhover"
          />
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useStore } from 'vuex';

import DiagramNode from './DiagramNode.vue';
import DiagramEdge from './DiagramEdge.vue';
import DiagramCluster from './DiagramCluster.vue';
import ActionSelect from '@/components/ActionSelect.vue';
import { compute_layout, merge_layout_defaults } from './layout';
import { make_identity_transform, to_svg_transform, zoom_around, fit_transform } from './transform';

// Single-glyph option sets for the two layout ActionSelects below (U+219x
// plain arrows for direction, U+21Bx corner arrows for a corner alignment
// plus U+2104 for center) -- each option's own `title` is what a caller
// sees when the (currently closed) native dropdown is open, since the
// select itself only ever shows one glyph, not a word.
const directionOptions = [
    {value: 'TB', label: '↓', title: 'Top → Bottom'},
    {value: 'BT', label: '↑', title: 'Bottom → Top'},
    {value: 'LR', label: '→', title: 'Left → Right'},
    {value: 'RL', label: '←', title: 'Right → Left'}
];
const alignOptions = [
    {value: '', label: '℄', title: 'Center'},
    {value: 'UL', label: '↰', title: 'Upper-left'},
    {value: 'UR', label: '↱', title: 'Upper-right'},
    {value: 'DL', label: '↲', title: 'Lower-left'},
    {value: 'DR', label: '↳', title: 'Lower-right'}
];

const props = defineProps({
    instanceId: {type: String, required: true}
});

const store = useStore();

// A viewport doesn't own a context, it's handed one at creation
// (sceneCreation.js) and looks it up by its own instanceId -- generic per
// doc/ui-session.rst, not specific to this module.
const contextId = computed(() => store.getters['widgetInstances/instance'](props.instanceId)?.contextId ?? null);
const boardNS = computed(() => `graphBoard_${contextId.value}`);
const selectionNS = computed(() => `selection_${contextId.value}`);

const nodes = computed(() => contextId.value ? store.getters[`${boardNS.value}/allNodes`] : []);
const edges = computed(() => contextId.value ? store.getters[`${boardNS.value}/allEdges`] : []);
const clusters = computed(() => contextId.value ? store.getters[`${boardNS.value}/allClusters`] : []);
const payloadLayoutHint = computed(() => contextId.value ? store.getters[`${boardNS.value}/payloadLayoutHint`] : {});

// Effective layout options (doc's "Layout"/"Diagrams"): this diagram's own
// explicit local override if it has one, else the board's payload hint
// merged under the built-in defaults.
const layoutOptions = computed(() =>
    store.getters['graphLayout/layoutOptions'](props.instanceId, merge_layout_defaults(payloadLayoutHint.value))
);

const layoutResult = computed(() => compute_layout(nodes.value, edges.value, layoutOptions.value, clusters.value));

// Human-readable current-state text for the two ActionSelects' overall
// tooltip (each option's own `title` only shows once the dropdown is
// open) -- e.g. "Layout direction: Left → Right" while the button itself
// just shows "→".
const directionLabel = computed(() =>
    directionOptions.find(opt => opt.value === layoutOptions.value.direction)?.title ?? layoutOptions.value.direction);
const alignLabel = computed(() =>
    alignOptions.find(opt => opt.value === (layoutOptions.value.align ?? ''))?.title ?? 'Center');

const selectedIDs = computed(() => contextId.value ? store.getters[`${selectionNS.value}/selectedItemIDs`] : new Set());
const highlightedIDs = computed(() => contextId.value ? store.getters[`${selectionNS.value}/highlightedItemIDs`] : new Set());

function set_direction(direction) {
    store.commit('graphLayout/set_layout_options', {viewportID: props.instanceId, patch: {direction}});
}

function set_align(align) {
    store.commit('graphLayout/set_layout_options', {viewportID: props.instanceId, patch: {align: align || null}});
}

// --- Selection/hover (doc's "Selection and forwarding") ---

function on_select(id, event) {
    if(!contextId.value) return;
    if(event.shiftKey) {
        if(selectedIDs.value.has(id))
            store.commit(`${selectionNS.value}/unselect_items`, [id]);
        else
            store.commit(`${selectionNS.value}/select_items`, [id]);
    } else {
        store.commit(`${selectionNS.value}/clear_selection`);
        store.commit(`${selectionNS.value}/select_items`, [id]);
    }
}

// Toolbar action (mirrors clicking empty background, see on_pointer_up
// below) -- an explicit escape hatch for when nothing's conveniently empty
// to click, e.g. a diagram that's fully packed with nodes/edges.
function clear_selection() {
    if(!contextId.value) return;
    store.commit(`${selectionNS.value}/clear_selection`);
}

function on_hover(id) {
    if(!contextId.value) return;
    store.commit(`${selectionNS.value}/set_hover`, {origin: 'diagram', ids: [id]});
}

function on_unhover() {
    if(!contextId.value) return;
    store.commit(`${selectionNS.value}/clear_hover`, 'diagram');
}

// --- Pan/zoom (doc's "Rendering") ---

const hostEl = ref(null);
const svgEl = ref(null);
const width = ref(0);
const height = ref(0);
const transform = ref(make_identity_transform());
let didInitialFit = false;

let resizeObserver;
let dragging = false;
let dragMoved = false;
let dragStartClientPx = [0, 0];
let dragStartTransform = make_identity_transform();

function measure() {
    if(!hostEl.value) return;
    const rect = hostEl.value.getBoundingClientRect();
    width.value = rect.width;
    height.value = rect.height;
}

function fit_to_view() {
    if(!layoutResult.value.nodes.length) return;
    transform.value = fit_transform(layoutResult.value, width.value, height.value);
}

// Auto-fit exactly once, the first time both a real layout and a real
// viewport size are available -- afterwards the user's own pan/zoom (or an
// explicit "Fit to view" click) is authoritative; every board/layout
// change simply keeps whatever view the user already has.
watch([layoutResult, width, height], ([result, w, h]) => {
    if(didInitialFit || !result.nodes.length || w === 0 || h === 0) return;
    transform.value = fit_transform(result, w, h);
    didInitialFit = true;
});

function on_wheel(event) {
    const rect = svgEl.value.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    transform.value = zoom_around(transform.value, px, py, factor);
}

// Middle-button drag anywhere, or left-button drag starting on the empty
// background rect, pans; a plain (non-dragged) left click on the
// background instead clears the current selection -- node/edge clicks are
// handled by their own @select, never reaching here since DiagramNode.vue/
// DiagramEdge.vue's own <g> is what's under the pointer there.
function on_pointer_down(event) {
    const isBackground = event.target === svgEl.value || event.target.classList?.contains('diagram-viewport__background');
    if(event.button !== 1 && !(event.button === 0 && isBackground)) return;
    event.preventDefault();
    svgEl.value.setPointerCapture(event.pointerId);
    dragging = true;
    dragMoved = false;
    dragStartClientPx = [event.clientX, event.clientY];
    dragStartTransform = transform.value;
}

function on_pointer_move(event) {
    if(!dragging) return;
    const dx = event.clientX - dragStartClientPx[0];
    const dy = event.clientY - dragStartClientPx[1];
    if(Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    transform.value = {k: dragStartTransform.k, tx: dragStartTransform.tx + dx, ty: dragStartTransform.ty + dy};
}

function on_pointer_up(event) {
    if(!dragging) return;
    dragging = false;
    svgEl.value.releasePointerCapture(event.pointerId);
    if(!dragMoved && event.button === 0 && contextId.value)
        store.commit(`${selectionNS.value}/clear_selection`);
}

function on_pointer_cancel() {
    dragging = false;
}

onMounted(() => {
    measure();
    requestAnimationFrame(measure);
    resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(hostEl.value);
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
});
</script>

<style scoped>
.diagram-viewport {
    width: 100%;
    height: 100%;
    background: var(--clr-bg-panel);
    color: var(--clr-fg-panel);
    font-size: 9pt;
}

/* Hovering top-left overlay (ThreeViewport.vue's .camera-widget/
   PlotViewport.vue's .plot-viewport__overlay-toolbar pattern) rather than
   the permanent, labeled bar this used to be -- the row itself carries no
   chrome of its own (.toolbar-floating, style.css); the direction/align
   pair reads as one control (a .button-group of single-glyph
   ActionSelects, tooltip carrying what the glyph means) while fit-to-view
   sits apart as its own button, a different kind of action. */
.diagram-viewport__toolbar {
    position: absolute;
    z-index: 10;
    top: var(--hover-toolbar-top);
    left: var(--hover-toolbar-left);
    display: flex;
    align-items: center;
}

.icon-button {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
}

.diagram-viewport__canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.diagram-viewport__canvas svg {
    display: block;
    touch-action: none;
}

.diagram-viewport__background {
    fill: var(--clr-bg-panel);
    cursor: grab;
}

.diagram-viewport__arrow {
    fill: var(--clr-border-inactive);
}

.diagram-viewport__arrow--highlighted {
    fill: var(--clr-graph-highlight);
}

.diagram-viewport__arrow--selected {
    fill: var(--clr-graph-selection);
}
</style>
