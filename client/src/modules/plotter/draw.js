// Canvas2D drawing for the plotter module's MP (main plotting area).
// Coordinates passed in (xScale(x), yScale(y)) are already CSS pixels -- the
// canvas context must already be DPR-scaled by the caller (see
// PlotViewport.vue's resize_canvas_backing_store) before any of these
// run, so nothing here needs to know about devicePixelRatio itself.

// Keyed by the item's "marker-type" (doc/module-plotter.rst's Markers
// section) -- a small type->implementation registry. Each entry's `mode`
// picks the Canvas2D finishing call draw_markers uses once the whole
// item's path is built ('stroke' for an outline shape like x-cross, 'fill'
// for a solid one like round) -- both still batch every point of one item
// into a single beginPath()/finish() pair, since fill()/stroke() apply
// per-subpath regardless of how many moveTo-started subpaths a path holds.
const MARKER_DRAWERS = {
    'x-cross': {
        mode: 'stroke',
        draw: (ctx, px, py, size) => {
            const h = size / 2;
            ctx.moveTo(px - h, py - h);
            ctx.lineTo(px + h, py + h);
            ctx.moveTo(px + h, py - h);
            ctx.lineTo(px - h, py + h);
        }
    },
    // Filled, solid dot -- deliberately "bolder" than x-cross's thin
    // stroked outline (see PlotViewport.vue's na64umff waveform rendering:
    // one of these per raw sample, alongside its own faded connecting
    // line), so a default radius bigger than x-cross's is used below
    // rather than sharing draw_markers' generic `size` fallback.
    'round': {
        mode: 'fill',
        draw: (ctx, px, py, size) => {
            const r = size / 2;
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, 2 * Math.PI);
        }
    }
};

const MARKER_DEFAULT_SIZE = {'x-cross': 8, 'round': 6};

export function draw_markers(ctx, item, xScale, yScale, {color, size}) {
    const type = item['marker-type'];
    const drawer = MARKER_DRAWERS[type];
    if(!drawer) {
        console.warn(`plotter: unknown marker-type "${type}"`);
        return;
    }
    const effectiveSize = item.size ?? size ?? MARKER_DEFAULT_SIZE[type] ?? 8;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for(const [x, y] of item.data)
        drawer.draw(ctx, xScale(x), yScale(y), effectiveSize);
    if(drawer.mode === 'fill')
        ctx.fill();
    else
        ctx.stroke();
}

export function draw_polyline(ctx, item, xScale, yScale, {color, width = 1.5}) {
    if(item.data.length === 0)
        return;
    // Item-level (doc/module-plotter.rst's "Styling": "line width and
    // stroke style" per primitive -- the facet-based styling sub-panel
    // that section also anticipates is a separate, larger, still-
    // undesigned piece; this is only the primitive's own explicit choice,
    // same as `closed` above). Canvas-native dash-array semantics, e.g.
    // `[6, 3]`; omitted/empty means solid. `width`/`alpha` are the same
    // kind of explicit opt-in (e.g. na64umff's raw-waveform polyline
    // rendering wide and faded behind its own per-sample round markers).
    // save/restore since setLineDash/globalAlpha are persistent
    // context-state changes that would otherwise leak into whatever's
    // drawn next.
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = item.width ?? width;
    ctx.globalAlpha = item.alpha ?? 1;
    ctx.setLineDash(item.dash ?? []);
    ctx.beginPath();
    item.data.forEach(([x, y], i) => {
        const px = xScale(x), py = yScale(y);
        if(i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    });
    if(item.closed)
        ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

// Halo-style outline for hover/selection (doc/module-plotter.rst's
// "Styling"): a wider/larger re-stroke of the same path/points, in the
// given indicator color, drawn *before* the item's own normal-colored pass
// so the outline reads as a colored border around the item rather than
// replacing its own color -- the Canvas2D equivalent of three-view's
// shader-based silhouette pass (hl-overlay.js), same visual *effect*
// (a colored outline, not a recolored item) via a much simpler technique
// suited to a 2D canvas rather than a 3D mask-and-composite pipeline.
// Always solid and round-jointed regardless of the item's own dash/cap
// style -- an outline that itself went dashed would defeat the point.
const OUTLINE_THICKNESS = 3;

export function draw_polyline_outline(ctx, item, xScale, yScale, color) {
    if(item.data.length === 0)
        return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = (item.width ?? 1.5) + 2 * OUTLINE_THICKNESS;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    item.data.forEach(([x, y], i) => {
        const px = xScale(x), py = yScale(y);
        if(i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    });
    if(item.closed)
        ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

// A stroked ring around each point, sized off the marker's own effective
// radius regardless of its actual shape (x-cross/round) -- simpler and more
// uniform than tracing each marker-type's own outline, and just as
// legible: every marker-type reads as "a colored ring around this point".
export function draw_markers_outline(ctx, item, xScale, yScale, color) {
    const type = item['marker-type'];
    const effectiveSize = item.size ?? MARKER_DEFAULT_SIZE[type] ?? 8;
    const r = effectiveSize / 2 + OUTLINE_THICKNESS / 2;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = OUTLINE_THICKNESS;
    ctx.beginPath();
    for(const [x, y] of item.data) {
        const px = xScale(x), py = yScale(y);
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, 2 * Math.PI);
    }
    ctx.stroke();
    ctx.restore();
}

export function clear(ctx, widthPx, heightPx) {
    ctx.clearRect(0, 0, widthPx, heightPx);
}

// In-progress rectangular-zoom drag preview (doc's "left drag: rectangular
// zoom"). [x0, y0]/[x1, y1] are raw on-screen pixels, in either order.
export function draw_zoom_rect(ctx, [x0, y0], [x1, y1], color) {
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    // +0.5 keeps a 1px stroke crisp instead of straddling (and blurring
    // across) a pixel boundary.
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
}

export function resolve_css_var(name, el = document.documentElement) {
    return getComputedStyle(el).getPropertyValue(name).trim();
}
