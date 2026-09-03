<!--
  2D plotter viewport (doc/module-plotter.rst), registered via
  modules/plotter/index.js as the "plot" data type's viewportComponent
  (doc/ui-session.rst's "Extension points").
  Renders the TB/UH/LV/RV/MP/LH layout, DPR-correct Canvas2D drawing, D3
  scales/zoom for one transformation domain, and tick rendering in an SVG
  overlay, over primitives read from this instance's own desk
  (store/plotDesk.js) -- a desk replaces a resource's items wholesale on
  every update, not an incremental diff; the plotter has no primitive that
  needs one item preserved across an update without rebuilding the rest.

  Still not done here (see the doc's "Open questions"): sub-item selection
  (a whole primitive is the smallest selectable unit today), the axis
  right-click context menu, and where a transformation domain's own extent/
  scale-type configuration comes from -- defaultTransfDomain below is a
  hardcoded stand-in until that's designed. Hover/selection (store/
  selection.js) mirrors modules/three-view/three/index.js's own scene
  picking: hitTest.js's nearest-under-cursor hover feeds a hover stack
  shift+wheel cycles through one item at a time (cycle_hover/on_wheel,
  while highlightAllUnderCursor is off -- the default, exposed by
  PlotHelpersPanel.vue's checkbox; a plain wheel always zooms regardless),
  and shift+click toggles selection of whatever's hovered (toggle_hover_
  selection); a plain click selects nothing.

  Layout note: unlike the doc's ASCII art (where UH/LH are drawn full-width),
  UH/LH here only span the MP column -- the conventional plotting-library
  layout, and the more useful one functionally (their ticks/scale belong to
  the MP width, not the LV/RV corners). Worth confirming this reading is
  what was intended.
-->
<template>
  <div class="plot-viewport">
    <div class="plot-viewport__box plot-viewport__box--tb" />

    <div class="plot-viewport__box plot-viewport__box--uh" />

    <div class="plot-viewport__box plot-viewport__box--lv">
      <svg
        class="plot-viewport__axis-svg plot-viewport__axis-svg--interactive"
        :width="lvWidth" :height="mpHeight"
        @pointerdown="on_axis_pointer_down('y', $event)"
        @pointermove="on_axis_pointer_move('y', $event)"
        @pointerup="on_axis_pointer_up('y', $event)"
        @pointercancel="on_axis_pointer_cancel('y')"
        @lostpointercapture="on_axis_pointer_cancel('y')"
        @dblclick="reset_transform('y')"
      >
        <g v-for="t in yTicks" :key="t.value">
          <line
            :x1="lvWidth - 5" :x2="lvWidth"
            :y1="t.px" :y2="t.px"
            class="plot-viewport__tick"
          />
          <text
            :x="lvWidth - 8" :y="t.px"
            class="plot-viewport__tick-label"
            text-anchor="end" dominant-baseline="middle"
          >{{ t.label }}</text>
        </g>
        <rect
          v-if="axisDragAxis === 'y'"
          x="0" :y="Math.min(axisDragStartPx, axisDragCurrentPx)"
          :width="lvWidth" :height="Math.abs(axisDragCurrentPx - axisDragStartPx)"
          class="plot-viewport__axis-drag-rect"
        />
      </svg>
    </div>

    <div ref="mpEl" class="plot-viewport__box plot-viewport__box--mp">
      <canvas
        ref="canvasEl"
        class="plot-viewport__canvas"
        :class="{'plot-viewport__canvas--panning': dragMode === 'pan'}"
        @pointerdown="on_pointer_down"
        @pointermove="on_pointer_move"
        @pointerup="on_pointer_up"
        @pointercancel="on_pointer_cancel"
        @lostpointercapture="on_pointer_cancel"
        @pointerleave="on_pointer_leave"
        @dblclick="reset_all_transforms"
        @wheel.prevent="on_wheel"
      />
    </div>

    <div class="plot-viewport__box plot-viewport__box--rv" />

    <div class="plot-viewport__box plot-viewport__box--lh">
      <svg
        class="plot-viewport__axis-svg plot-viewport__axis-svg--interactive"
        :width="mpWidth" :height="lhHeight"
        @pointerdown="on_axis_pointer_down('x', $event)"
        @pointermove="on_axis_pointer_move('x', $event)"
        @pointerup="on_axis_pointer_up('x', $event)"
        @pointercancel="on_axis_pointer_cancel('x')"
        @lostpointercapture="on_axis_pointer_cancel('x')"
        @dblclick="reset_transform('x')"
      >
        <g v-for="t in xTicks" :key="t.value">
          <line :x1="t.px" :x2="t.px" y1="0" y2="5" class="plot-viewport__tick" />
          <text :x="t.px" y="18" class="plot-viewport__tick-label" text-anchor="middle">{{ t.label }}</text>
        </g>
        <rect
          v-if="axisDragAxis === 'x'"
          :x="Math.min(axisDragStartPx, axisDragCurrentPx)" y="0"
          :width="Math.abs(axisDragCurrentPx - axisDragStartPx)" :height="lhHeight"
          class="plot-viewport__axis-drag-rect"
        />
      </svg>
    </div>

    <div class="plot-viewport__overlay-toolbar toolbar-floating">
      <button
        class="icon-button"
        type="button"
        title="Fit view to plotted content"
        @click="fit_to_content"
      >
        <span class="vi vi-frame-selected" aria-hidden="true" />
      </button>

      <button
        class="icon-button"
        type="button"
        title="Clear selection"
        :disabled="selectedIds.size === 0"
        @click="clear_selection"
      >
        <span class="vi vi-clear-selection" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useStore } from 'vuex';

import { make_scale } from './scales';
import { draw_markers, draw_polyline, draw_markers_outline, draw_polyline_outline, draw_zoom_rect, clear, resolve_css_var } from './draw';
import { make_identity_transform, apply_transform, zoom_around, pan_by, zoom_to_rect } from './zoom';
import { compute_fit_transforms } from './viewFit';
import { find_hovered_items } from './hitTest';
import { resolve_forwarded_primitives } from './store/plotDesk';

const props = defineProps({
    instanceId: {type: String, required: true}
});

const store = useStore();

// A viewport doesn't own a context, it's handed one at creation
// (sceneCreation.js) and looks it up by its own instanceId -- generic
// per doc/ui-session.rst, not specific to this module.
const contextId = computed(() => store.getters['widgetInstances/instance'](props.instanceId)?.contextId ?? null);

// This module's own `selection` contextStoreModules entry (modules/plotter/
// index.js) -- the same generic hover/selection state three-view and graph
// already use (store/selection.js). `highlightedIds`/`selectedIds` below
// feed hitTest.js and redraw()'s own outline passes (draw.js's
// draw_*_outline) -- hover and selection each get their own colored
// outline now, drawn *in addition to* an item's own normal color rather
// than replacing it.
const selectionNS = computed(() => contextId.value ? `selection_${contextId.value}` : null);
const highlightedIds = computed(() =>
    selectionNS.value ? store.getters[`${selectionNS.value}/highlightedItemIDs`] : new Set()
);
const selectedIds = computed(() =>
    selectionNS.value ? store.getters[`${selectionNS.value}/selectedItemIDs`] : new Set()
);
const highlightAllUnderCursor = computed(() =>
    selectionNS.value ? store.getters[`${selectionNS.value}/highlightAllUnderCursor`] : false
);

// This desk's items across every resource attached to it (store/plotDesk.js
// -- whole-payload replace per resource, no per-item diffing).
const primitives = computed(() => {
    if(!contextId.value) return [];
    return store.getters[`plotDesk_${contextId.value}/allPrimitives`] ?? [];
});

// Items routed in via the cross-module "selection sink" mechanism (doc/
// ui-session.rst's "Selection sinks") -- kept in this context's own
// sinkInbox sub-state (store/sinkInbox.js), never merged into plotDesk's
// directly-loaded primitivesByResource above (a sink item's forwarded data
// is never mistaken for a directly-attached resource's own). Every
// accepted item is typed 'plot' (modules/plotter/index.js's
// acceptsPayloadTypes), meaning its resolved snapshot is already shaped
// like this module's own plotData envelope (`{primitives: [...]}`) -- read
// uniformly, exactly like directly-loaded data. Which module produced it,
// or what it looked like there (a graph node's subjectData, or anything
// else), is never inspected here -- see store/plotDesk.js's
// resolve_forwarded_primitives (shared with index.js's own
// buildSinkSnapshot/resolveSinkItem, since a selected primitive eligible
// for further forwarding may be either a desk primitive or one already
// forwarded in from elsewhere, e.g. an FSM node's own dashed pulse curves).
const sinkPrimitives = computed(() => {
    if(!contextId.value) return [];
    return resolve_forwarded_primitives(store, contextId.value);
});

// Not yet sourced from a payload or any per-desk config UI (doc's "Open
// questions") -- a single hardcoded domain every primitive is expected to
// declare itself under via `_transfDomain: "main"`.
const defaultTransfDomain = {
    name: 'main',
    x: {extent: [0, 10], scaleType: 'linear'},
    y: {extent: [0, 5], scaleType: 'linear'}
};

const lvWidth = 44;
const lhHeight = 28;
// A real mouse rarely clicks pixel-perfectly; below this a drag is treated
// as a click (no zoom applied) rather than turning a few pixels of jitter
// into an extreme zoom_to_rect factor (extentPx / dragPx -- a 4px drag over
// a ~1200px MP is already a ~300x zoom).
const MIN_DRAG_PX = 8;
// zoom.js's k grows as the domain is stretched over more screen pixels than
// the viewport -- i.e. zoomed IN means k increases, so the step for
// "zoom in" must be > 1 (zoom.js's own comment covers why k works this way).
const WHEEL_ZOOM_STEP = 1.1;
// Same role as MIN_DRAG_PX above, for hitTest.js's nearest-under-cursor
// hover instead of drag-vs-click: how close (in screen px) the pointer must
// be to a primitive before it counts as "hovering" it.
const HOVER_HIT_PX = 6;

const mpEl = ref(null);
const canvasEl = ref(null);
const mpWidth = ref(0);
const mpHeight = ref(0);

// Current view, as a pixel-space transform composed onto the fixed base
// scales below -- see zoom.js. Always replaced wholesale (never mutated in
// place) so the plain (shallow) watch further down picks up every change.
const xTransform = ref(make_identity_transform());
const yTransform = ref(make_identity_transform());

// MP-only for now (doc's "Supported interactions in the MP"); click/
// shift+drag selection is deliberately not implemented here -- see the
// doc's "Open questions".
const dragMode = ref(null); // null | 'rect-zoom' | 'pan'
const dragStartPx = ref([0, 0]);
const dragCurrentPx = ref([0, 0]);
let panLastPx = [0, 0]; // not reactive: read/written only within one drag, redraw is driven by xTransform/yTransform instead

// LV/LH axis-box drag (doc's "drag directly along an axis, drawing a
// sub-interval: alter only that axis's D3 domain"). Separate from the MP's
// dragMode above -- a different pair of elements, and by design touches
// only one of xTransform/yTransform rather than both.
const axisDragAxis = ref(null); // null | 'x' | 'y'
const axisDragStartPx = ref(0);
const axisDragCurrentPx = ref(0);

let resizeObserver;
let themeObserver;

function measure_mp() {
    const rect = mpEl.value.getBoundingClientRect();
    mpWidth.value = rect.width;
    mpHeight.value = rect.height;
}

onMounted(() => {
    // Measure synchronously on mount rather than waiting for
    // ResizeObserver's first callback -- that first callback is tied to the
    // browser's rendering/compositing cycle and can be delayed indefinitely
    // in a tab that isn't actively compositing frames (e.g. a backgrounded
    // preview tab), which would otherwise leave the canvas stuck at its
    // 300x150 default. ResizeObserver still drives every update after this.
    measure_mp();
    // Grid track sizing (the MP column/row is "1fr") isn't always settled
    // the instant onMounted runs -- one more measurement after a paint
    // catches that case without waiting on ResizeObserver.
    requestAnimationFrame(measure_mp);

    resizeObserver = new ResizeObserver(entries => {
        const {width, height} = entries[0].contentRect;
        mpWidth.value = width;
        mpHeight.value = height;
    });
    resizeObserver.observe(mpEl.value);

    // Both ResizeObserver and requestAnimationFrame callbacks are spec'd to
    // be suspended for a hidden document (backgrounded/inactive tab) -- a
    // component that first mounts in that state (or whose panel becomes
    // visible only later, e.g. an initially-collapsed split) would otherwise
    // never get a first real measurement. visibilitychange is exempt from
    // that suspension, so it's the one signal guaranteed to still fire.
    document.addEventListener('visibilitychange', on_visibility_change);

    // Belt-and-braces escape hatch for any in-progress drag (MP rect-zoom/
    // pan, or an axis-box drag): Escape, or the window losing focus
    // mid-drag (e.g. alt-tabbing away, which the pointer's own up/cancel
    // events won't necessarily follow). Whatever the actual cause of a
    // stuck drag turns out to be, this guarantees there's always a way out
    // of it rather than relying solely on getting pointer capture right.
    window.addEventListener('keydown', on_key_down);
    window.addEventListener('blur', cancel_all_drags);

    // resolve_css_var (used for canvas colors -- SVG's own `stroke:
    // var(--...)` doesn't need this, the browser resolves that live) reads
    // document.documentElement's *current* computed style. main.js sets
    // data-theme only after this component can already have mounted and
    // drawn once, and --clr-legend1/2 are only defined inside a
    // [data-theme=...] block -- so a redraw that races ahead of it resolves
    // to nothing, canvas silently keeps its default black strokeStyle, and
    // the very first paint comes out looking grey until some later, unrelated
    // redraw (any interaction) happens to run after data-theme lands. Watch
    // the attribute directly instead of hoping a redraw happens to be late
    // enough -- this also repaints correctly if the app's theme is toggled
    // while this is open, which nothing here previously did either.
    themeObserver = new MutationObserver(redraw);
    themeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
});

function on_visibility_change() {
    if(!document.hidden)
        measure_mp();
}

function cancel_all_drags() {
    dragMode.value = null;
    axisDragAxis.value = null;
    clear_hover();
}

// Always-available way back to the full view, independent of whatever
// caused a given zoom level (accidental or not) -- doesn't depend on
// diagnosing *why* a view got stuck, unlike the drag-cancellation above.
function reset_transform(axis) {
    if(axis === 'x')
        xTransform.value = make_identity_transform();
    else
        yTransform.value = make_identity_transform();
}

function reset_all_transforms() {
    reset_transform('x');
    reset_transform('y');
}

// Floating toolbar button (see the MP box in the template). Fits to
// whatever's currently plotted -- own desk primitives and sink-forwarded
// ones alike, same combined set redraw() draws -- falling back to the
// domain's own default view box when there's nothing to fit to (viewFit.js).
function fit_to_content() {
    const items = [...primitives.value, ...sinkPrimitives.value];
    const fit = compute_fit_transforms(
        items, defaultTransfDomain, baseXScale.value, baseYScale.value, mpWidth.value, mpHeight.value
    );
    if(fit === null) {
        reset_all_transforms();
        return;
    }
    xTransform.value = fit.xTransform;
    yTransform.value = fit.yTransform;
}

function on_key_down(event) {
    if(event.key === 'Escape')
        cancel_all_drags();
}

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    document.removeEventListener('visibilitychange', on_visibility_change);
    window.removeEventListener('keydown', on_key_down);
    window.removeEventListener('blur', cancel_all_drags);
});

// Fixed (never mutated by zoom/pan) -- the full extent of the transform
// domain, mapped once onto the current MP pixel size. Zoom and pan only
// ever affect xTransform/yTransform above, composed on top of these via
// zoom.js's apply_transform.
const baseXScale = computed(() => make_scale({
    scaleType: defaultTransfDomain.x.scaleType,
    extent: defaultTransfDomain.x.extent,
    rangePx: [0, mpWidth.value]
}));

// SVG/canvas y grows downward; the domain's y should grow upward, hence the
// flipped range (this is D3's range in the disambiguated sense -- see
// scales.js).
const baseYScale = computed(() => make_scale({
    scaleType: defaultTransfDomain.y.scaleType,
    extent: defaultTransfDomain.y.extent,
    rangePx: [mpHeight.value, 0]
}));

const xScale = computed(() => apply_transform(baseXScale.value, xTransform.value));
const yScale = computed(() => apply_transform(baseYScale.value, yTransform.value));

// xScale/yScale's own .domain() never changes (only their range does, via
// zoom/pan -- see zoom.js) -- so .ticks() on them directly would always
// return the same "nice" values for the *full* original extent, regardless
// of zoom. Ticks need to reflect what's actually visible instead: invert
// the MP's screen edges through the current scale to get that visible
// window, then generate "nice" ticks over just that sub-range. Positions
// still come from the real xScale/yScale, so they land correctly either way.
const xTicks = computed(() => {
    const visible = [xScale.value.invert(0), xScale.value.invert(mpWidth.value)].sort((a, b) => a - b);
    const tickScale = make_scale({scaleType: defaultTransfDomain.x.scaleType, extent: visible, rangePx: [0, mpWidth.value]});
    const format = tickScale.tickFormat(6);
    return tickScale.ticks(6).map(value => ({value, px: xScale.value(value), label: format(value)}));
});

const yTicks = computed(() => {
    const visible = [yScale.value.invert(0), yScale.value.invert(mpHeight.value)].sort((a, b) => a - b);
    const tickScale = make_scale({scaleType: defaultTransfDomain.y.scaleType, extent: visible, rangePx: [mpHeight.value, 0]});
    const format = tickScale.tickFormat(5);
    return tickScale.ticks(5).map(value => ({value, px: yScale.value(value), label: format(value)}));
});

function resize_canvas_backing_store() {
    const canvas = canvasEl.value;
    if(!canvas || mpWidth.value === 0 || mpHeight.value === 0)
        return;
    // HiDPI concern flagged in doc/module-plotter.rst's Implementation
    // section: the backing store must be sized in device pixels while
    // drawing commands stay in CSS pixels, or the canvas renders blurry on
    // a scaled display.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(mpWidth.value * dpr);
    canvas.height = Math.round(mpHeight.value * dpr);
    canvas.style.width = `${mpWidth.value}px`;
    canvas.style.height = `${mpHeight.value}px`;
    const ctx = canvas.getContext('2d');
    // setTransform (not scale) so repeated resizes don't compound the factor.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function redraw() {
    resize_canvas_backing_store();
    const canvas = canvasEl.value;
    if(!canvas || mpWidth.value === 0 || mpHeight.value === 0)
        return;
    const ctx = canvas.getContext('2d');
    clear(ctx, mpWidth.value, mpHeight.value);

    const markerColor = resolve_css_var('--clr-legend1');
    const lineColor = resolve_css_var('--clr-legend2');
    // Distinct from the desk's own directly-loaded primitives above and
    // from the two interaction-state colors below -- a dedicated palette
    // slot (not `--clr-graph-selection`, despite the name similarity: that
    // one is this app's actual "selected" color everywhere else --
    // DiagramNode.vue/DiagramEdge.vue -- and this module now has a genuine
    // local-selection outline of its own that needs it instead).
    const sinkColor = resolve_css_var('--clr-legend6');
    // The app-wide hover/selection color pair (DiagramNode.vue/
    // DiagramEdge.vue use the same two for the same meanings) -- drawn as
    // an outline *behind* an item's own normal color now (draw.js's
    // draw_*_outline), the Canvas2D equivalent of three-view's shader-based
    // silhouette pass, rather than replacing the item's own color like
    // before. An item can be hovered and selected at once; both outlines
    // are drawn, selection first so a hover outline on top reads as "this
    // one, right now" over "this one, persistently".
    const highlightColor = resolve_css_var('--clr-graph-highlight');
    const selectedColor = resolve_css_var('--clr-graph-selection');
    const hovered = highlightedIds.value;
    const selected = selectedIds.value;

    function draw_item(item, defaultColor) {
        const isHovered = hovered.has(item._id);
        const isSelected = selected.has(item._id);
        if(item._type === 'markers') {
            if(isSelected) draw_markers_outline(ctx, item, xScale.value, yScale.value, selectedColor);
            if(isHovered) draw_markers_outline(ctx, item, xScale.value, yScale.value, highlightColor);
            draw_markers(ctx, item, xScale.value, yScale.value, {color: defaultColor});
        } else if(item._type === 'polyline') {
            if(isSelected) draw_polyline_outline(ctx, item, xScale.value, yScale.value, selectedColor);
            if(isHovered) draw_polyline_outline(ctx, item, xScale.value, yScale.value, highlightColor);
            draw_polyline(ctx, item, xScale.value, yScale.value, {color: defaultColor});
        }
    }

    for(const item of primitives.value) {
        if(item._transfDomain === defaultTransfDomain.name)
            draw_item(item, item._type === 'markers' ? markerColor : lineColor);
    }

    for(const item of sinkPrimitives.value) {
        if(item._transfDomain === defaultTransfDomain.name)
            draw_item(item, sinkColor);
    }

    if(dragMode.value === 'rect-zoom')
        draw_zoom_rect(ctx, dragStartPx.value, dragCurrentPx.value, resolve_css_var('--clr-border-active'));
}

watch(
    [mpWidth, mpHeight, xTransform, yTransform, dragMode, dragCurrentPx, primitives, sinkPrimitives, highlightedIds, selectedIds],
    redraw
);

// --- MP interactions (doc's "Supported interactions in the MP") ---

function pointer_px(event) {
    return [event.offsetX, event.offsetY];
}

function on_pointer_down(event) {
    // Left button: rectangular zoom. Middle button: pan. (Doc also lists
    // plain click and shift+drag for selection -- deliberately not
    // implemented here, see the doc's "Open questions".)
    if(event.button !== 0 && event.button !== 1)
        return;
    event.preventDefault(); // stops the browser's native middle-click autoscroll UI
    canvasEl.value.setPointerCapture(event.pointerId);
    // Hover is deliberately left untouched here (on_pointer_move only
    // resumes updating it once the drag ends, so it just freezes at
    // whatever it already was for the duration of an actual drag) -- a
    // below-threshold "click" needs whatever's already hovered (including
    // a wheel-cycled non-nearest item) to still be there at pointer-up for
    // shift+click to toggle, exactly like ThreeView's own on_click
    // (ThreeViewport.vue) relies on continuous mousemove hover, never
    // recomputed by the click itself. A prior version cleared hover here
    // and re-hit-tested at pointer-up instead, which silently discarded
    // whatever the wheel had cycled to on every single click -- caught only
    // by driving this live, not by reading the code.
    const px = pointer_px(event);
    if(event.button === 0) {
        dragMode.value = 'rect-zoom';
        dragStartPx.value = px;
        dragCurrentPx.value = px;
    } else {
        dragMode.value = 'pan';
        panLastPx = px;
    }
}

function clear_hover() {
    if(selectionNS.value) store.commit(`${selectionNS.value}/clear_hover`, 'mp');
    hoverStack = [];
    hoverCycleIndex = 0;
}

// Ordered (nearest-first) ids from the last hit-test, and which one
// `cycle_hover` below is currently pointing at -- same role as ThreeView's
// own `_hoverStack`/`_hoverCycleIndex` (three/index.js's update_pointer/
// cycle_hover), just against hitTest.js's 2D nearest-under-cursor instead
// of a 3D raycast. Not reactive on purpose: only the hover *committed to
// the store* needs to trigger a redraw, not this bookkeeping itself.
let hoverStack = [];
let hoverCycleIndex = 0;

// Nearest-under-cursor hover (doc's "Open questions": the hover half of
// "click: nearest-object selection", left undesigned there). Only runs
// outside a drag -- see on_pointer_down's clear_hover.
function update_hover(px, py) {
    if(!selectionNS.value) return;
    const domainItems = [...primitives.value, ...sinkPrimitives.value]
        .filter(item => item._transfDomain === defaultTransfDomain.name);
    const hits = find_hovered_items(domainItems, xScale.value, yScale.value, px, py, HOVER_HIT_PX);
    if(hits.length === 0) {
        clear_hover();
        return;
    }
    hoverStack = hits.map(h => h.id);
    hoverCycleIndex = 0;
    const ids = highlightAllUnderCursor.value ? hoverStack : [hoverStack[0]];
    store.commit(`${selectionNS.value}/set_hover`, {origin: 'mp', ids});
}

// Steps which single item (from the last hit-test's under-cursor stack,
// built by update_hover above) is highlighted, without re-hit-testing --
// driven by shift+wheel while `highlightAllUnderCursor` is off, mirroring
// ThreeView's own cycle_hover/handle_wheel exactly. A no-op with nothing
// under the cursor.
function cycle_hover(direction) {
    const n = hoverStack.length;
    if(n === 0) return;
    hoverCycleIndex = ((hoverCycleIndex + direction) % n + n) % n;
    store.commit(`${selectionNS.value}/set_hover`, {origin: 'mp', ids: [hoverStack[hoverCycleIndex]]});
}

// Toggles selection membership of whichever item(s) are currently
// mp-hovered -- the full under-cursor stack, or just the single cycled
// item, depending on `highlightAllUnderCursor` -- driven by shift+click
// (see on_pointer_up below). Mirrors ThreeView's own
// toggle_hover_selection (three/index.js) exactly, minus its
// marker-vs-whole-item distinction (the plotter has no sub-item selection
// yet, see this file's header comment).
function toggle_hover_selection() {
    if(!selectionNS.value) return;
    const hovered = store.getters[`${selectionNS.value}/hoveredIDs`]('mp');
    if(hovered.size === 0) return;

    const selected = store.getters[`${selectionNS.value}/selectedItemIDs`];
    const toSelect = [];
    const toUnselect = [];
    for(const id of hovered) {
        if(selected.has(id)) toUnselect.push(id);
        else toSelect.push(id);
    }

    if(toUnselect.length) store.commit(`${selectionNS.value}/unselect_items`, toUnselect);
    if(toSelect.length) store.commit(`${selectionNS.value}/select_items`, toSelect);
}

// Toolbar action -- an explicit escape hatch alongside the implicit
// plain-click-on-empty-space clear (reset_all_transforms's own dblclick
// aside, there's no single-click-clears-selection gesture on the plotter
// today, unlike DiagramViewport.vue's background click).
function clear_selection() {
    if(!selectionNS.value) return;
    store.commit(`${selectionNS.value}/clear_selection`);
}

function on_pointer_move(event) {
    if(dragMode.value === 'rect-zoom') {
        dragCurrentPx.value = pointer_px(event);
    } else if(dragMode.value === 'pan') {
        const [px, py] = pointer_px(event);
        xTransform.value = pan_by(xTransform.value, px - panLastPx[0]);
        yTransform.value = pan_by(yTransform.value, py - panLastPx[1]);
        panLastPx = [px, py];
    } else {
        const [px, py] = pointer_px(event);
        update_hover(px, py);
    }
}

function on_pointer_leave() {
    if(dragMode.value === null)
        clear_hover();
}

function on_pointer_up(event) {
    if(dragMode.value === null)
        return;
    if(dragMode.value === 'rect-zoom') {
        const [px0, py0] = dragStartPx.value;
        const [px1, py1] = dragCurrentPx.value;
        // Below-threshold drags are treated as a plain click. Hover was
        // never touched by pointerdown/this drag (see on_pointer_down's own
        // comment), so it's still whatever the last real pointermove left
        // it as -- shift+click toggles selection of exactly that (including
        // a wheel-cycled non-nearest item); a plain click selects nothing.
        // Mirrors ThreeView's own on_click (ThreeViewport.vue) exactly:
        // click never re-hit-tests, only continuous movement does.
        if(Math.abs(px1 - px0) >= MIN_DRAG_PX && Math.abs(py1 - py0) >= MIN_DRAG_PX) {
            const [xLo, xHi] = px0 < px1 ? [px0, px1] : [px1, px0];
            const [yLo, yHi] = py0 < py1 ? [py0, py1] : [py1, py0];
            xTransform.value = zoom_to_rect(xTransform.value, xLo, xHi, mpWidth.value);
            yTransform.value = zoom_to_rect(yTransform.value, yLo, yHi, mpHeight.value);
        } else if(event.shiftKey) {
            toggle_hover_selection();
        }
    }
    dragMode.value = null;
    canvasEl.value.releasePointerCapture(event.pointerId);
}

// Also bound to lostpointercapture, not just pointercancel: if the button
// is released somewhere the page never gets a DOM event for at all (e.g.
// the gesture ends over browser/devtools chrome rather than page content),
// pointerup/pointercancel simply never fire here -- but capture is tied to
// the OS-level button state regardless of DOM dispatch, so
// lostpointercapture still does, making it the one signal this drag is
// guaranteed to end on.
function on_pointer_cancel() {
    dragMode.value = null;
}

// Shift+wheel cycles which single hovered item is highlighted instead of
// zooming, but only while `highlightAllUnderCursor` is off -- otherwise
// (including a plain wheel, which always zooms regardless of the toggle)
// this falls through to the zoom below, since there's nothing meaningful to
// cycle through once every under-cursor item is already highlighted at
// once. Mirrors ThreeView's own handle_wheel (three/index.js) exactly, just
// always "consumed" when it does apply: the MP canvas has no separate
// native wheel listener to protect against (unlike ThreeView's
// OrbitControls, see that file's own comment), and the template already
// binds this via @wheel.prevent regardless.
function on_wheel(event) {
    if(event.shiftKey && !highlightAllUnderCursor.value) {
        cycle_hover(event.deltaY > 0 ? 1 : -1);
        return;
    }
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    const [px, py] = pointer_px(event);
    xTransform.value = zoom_around(xTransform.value, px, factor);
    yTransform.value = zoom_around(yTransform.value, py, factor);
}

// --- LV/LH axis interactions (doc's "Axes boxes") ---
//
// The LH svg spans the same grid column as MP (both sit in the "1fr" middle
// column), and LV spans the same row as MP (both sit in the "lv mp rv"
// row) -- see the layout note at the top of this file -- so offsetX inside
// LH and offsetY inside LV already land in the exact same pixel space as
// xScale/yScale use, with no extra conversion needed.

function on_axis_pointer_down(axis, event) {
    if(event.button !== 0)
        return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const px = axis === 'x' ? event.offsetX : event.offsetY;
    axisDragAxis.value = axis;
    axisDragStartPx.value = px;
    axisDragCurrentPx.value = px;
}

function on_axis_pointer_move(axis, event) {
    if(axisDragAxis.value !== axis)
        return;
    axisDragCurrentPx.value = axis === 'x' ? event.offsetX : event.offsetY;
}

function on_axis_pointer_up(axis, event) {
    if(axisDragAxis.value !== axis)
        return;
    const px0 = axisDragStartPx.value, px1 = axisDragCurrentPx.value;
    if(Math.abs(px1 - px0) >= MIN_DRAG_PX) {
        const [lo, hi] = px0 < px1 ? [px0, px1] : [px1, px0];
        if(axis === 'x')
            xTransform.value = zoom_to_rect(xTransform.value, lo, hi, mpWidth.value);
        else
            yTransform.value = zoom_to_rect(yTransform.value, lo, hi, mpHeight.value);
    }
    axisDragAxis.value = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
}

// Also bound to lostpointercapture -- see on_pointer_cancel's comment.
function on_axis_pointer_cancel(axis) {
    if(axisDragAxis.value === axis)
        axisDragAxis.value = null;
}
</script>

<style scoped>
.plot-viewport {
    position: relative;
    display: grid;
    grid-template-columns: 44px 1fr 16px;
    grid-template-rows: 28px 20px 1fr 28px;
    grid-template-areas:
        "tb tb tb"
        ".  uh ."
        "lv mp rv"
        ".  lh .";
    width: 100%;
    height: 100%;
    background: var(--clr-bg-panel);
    color: var(--clr-fg-panel);
    font-size: 9pt;
    /*
     * The whole widget is drag-driven (MP zoom/pan, axis-box zoom); a real
     * mouse click is rarely pixel-perfect, so a tiny stray drag can start a
     * native text-selection instead. Every drag zone calls preventDefault(),
     * which is exactly what would otherwise let a plain click elsewhere
     * collapse a stray selection, so it's worth suppressing at the source.
     */
    user-select: none;
}

.plot-viewport__box--tb {
    grid-area: tb;
}

.plot-viewport__box--uh { grid-area: uh; border-bottom: 1px solid var(--clr-border-inactive); }
/*
 * lv/lh need overflow:hidden for the same reason mp does, even though
 * neither one scrolls anything: a grid item's *automatic* minimum size
 * defaults to its content's min-content size unless overflow is something
 * other than "visible" (CSS Grid spec). Their content is an <svg
 * :width/:height> bound to mpWidth/mpHeight, i.e. a *stale* value between
 * resizes (only ResizeObserver's callback advances it) -- without this,
 * that stale, already-large SVG size becomes a floor under the "mp" grid
 * track that never lowers, so the layout can grow but never shrink back
 * (confirmed: after growing then shrinking the window, .box--mp measured
 * *wider than its own parent*, stuck at the largest size ever reached).
 */
.plot-viewport__box--lv { grid-area: lv; border-right: 1px solid var(--clr-border-inactive); position: relative; overflow: hidden; }
.plot-viewport__box--mp { grid-area: mp; position: relative; overflow: hidden; }
.plot-viewport__box--rv { grid-area: rv; border-left: 1px solid var(--clr-border-inactive); }
.plot-viewport__box--lh { grid-area: lh; border-top: 1px solid var(--clr-border-inactive); overflow: hidden; }

.plot-viewport__canvas { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
.plot-viewport__canvas--panning { cursor: grabbing; }
.plot-viewport__axis-svg { display: block; }
.plot-viewport__axis-svg--interactive { cursor: crosshair; touch-action: none; }
.plot-viewport__tick { stroke: var(--clr-border-active); stroke-width: 1; }
.plot-viewport__tick-label { fill: var(--clr-fg-panel); font-size: 1em; pointer-events: none; font-family: monospace; }
.plot-viewport__axis-drag-rect { fill: var(--clr-border-active); opacity: 0.25; pointer-events: none; }

/*
 * Hovering top-left overlay, not a permanent toolbar row -- floats over the
 * whole panel (a direct child of .plot-viewport, positioned against *its*
 * corner, not .plot-viewport__box--mp's -- the MP grid cell starts inset
 * by the TB/LV boxes, which would otherwise misalign this against
 * DiagramViewport.vue's/PanelResidentChrome.vue's own overlays, both
 * anchored to their whole panel) rather than claiming a dedicated,
 * always-visible strip for what's currently a single button. The row
 * itself is invisible (.toolbar-floating, style.css); the button carries
 * its own blurred backing, same as those other two.
 */
.plot-viewport__overlay-toolbar {
    position: absolute;
    z-index: 10;
    top: var(--hover-toolbar-top);
    left: var(--hover-toolbar-left);
    display: flex;
}

.icon-button {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
}
</style>
