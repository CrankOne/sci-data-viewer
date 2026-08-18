// Canvas2D drawing for the plotter module's MP (main plotting area).
// Coordinates passed in (xScale(x), yScale(y)) are already CSS pixels -- the
// canvas context must already be DPR-scaled by the caller (see
// PlotViewport.vue's resize_canvas_backing_store) before any of these
// run, so nothing here needs to know about devicePixelRatio itself.

// Keyed by the item's "marker-type" (doc/module-plotter.rst's Markers
// section) -- a small type->implementation registry, kept inline here
// since there's only one marker type so far.
const MARKER_DRAWERS = {
    'x-cross': (ctx, px, py, size) => {
        const h = size / 2;
        ctx.moveTo(px - h, py - h);
        ctx.lineTo(px + h, py + h);
        ctx.moveTo(px + h, py - h);
        ctx.lineTo(px - h, py + h);
    }
};

export function draw_markers(ctx, item, xScale, yScale, {color, size = 8}) {
    const draw_one = MARKER_DRAWERS[item['marker-type']];
    if(!draw_one) {
        console.warn(`plotter: unknown marker-type "${item['marker-type']}"`);
        return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for(const [x, y] of item.data)
        draw_one(ctx, xScale(x), yScale(y), size);
    ctx.stroke();
}

export function draw_polyline(ctx, item, xScale, yScale, {color, width = 1.5}) {
    if(item.data.length === 0)
        return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
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
