// Nearest-under-cursor hit-testing for the MP (doc/module-plotter.rst's
// "Open questions": "click: nearest-object selection" was left undesigned
// for this module -- this covers the hover half of that, for both
// primitive types PlotViewport.vue draws, at whole-primitive granularity
// (no sub-item/sub-point hover, same as this module has no sub-item
// selection yet either). A plain linear scan over every item/point is fine
// at today's data sizes (doc's own "modest scatterplots" framing); revisit
// with a spatial index if that stops being true.
//
// Deliberately never sees grid lines: those are a fixed background layer
// (doc's "Implementation" section), not a `primitives` item, so they can't
// reach here regardless of what PlotViewport.vue passes in -- worth
// remembering once grid lines actually exist, so they don't get wired into
// this by accident.

function point_to_segment_distance_sq(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if(lenSq === 0) {
        const ddx = px - x1, ddy = py - y1;
        return ddx * ddx + ddy * ddy;
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    const ddx = px - cx, ddy = py - cy;
    return ddx * ddx + ddy * ddy;
}

function polyline_distance_px(item, xScale, yScale, px, py) {
    let best = Infinity;
    const pts = item.data;
    if(pts.length === 1) {
        const [x, y] = pts[0];
        return Math.hypot(xScale(x) - px, yScale(y) - py);
    }
    for(let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
        const dSq = point_to_segment_distance_sq(px, py, xScale(x1), yScale(y1), xScale(x2), yScale(y2));
        if(dSq < best) best = dSq;
    }
    return Math.sqrt(best);
}

function markers_distance_px(item, xScale, yScale, px, py) {
    let best = Infinity;
    for(const [x, y] of item.data) {
        const d = Math.hypot(xScale(x) - px, yScale(y) - py);
        if(d < best) best = d;
    }
    return best;
}

// `items` must already carry a stable `_id` (see plotDesk.js/PlotViewport
// .vue's sinkPrimitives) and be pre-filtered to the transformation domain
// currently on screen -- this doesn't re-check `_transfDomain` itself.
// Returns `{id, distance}` for everything within `thresholdPx`, nearest
// first.
export function find_hovered_items(items, xScale, yScale, px, py, thresholdPx) {
    const hits = [];
    for(const item of items) {
        let distance;
        if(item._type === 'polyline' && item.data.length > 0)
            distance = polyline_distance_px(item, xScale, yScale, px, py);
        else if(item._type === 'markers')
            distance = markers_distance_px(item, xScale, yScale, px, py);
        else
            continue;
        if(distance <= thresholdPx)
            hits.push({id: item._id, distance});
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
}

// Rectangle-drag selection (PlotViewport.vue's own left-drag gesture): an
// item counts as "in" the rectangle the moment any single one of its own
// data points falls inside it -- deliberately not "entirely inside", so a
// mostly off-screen curve that just clips the corner of a drawn box still
// reads as part of what was just boxed, matching how a user visually judges
// what they dragged over rather than requiring the whole shape to fit.
// `xLo/yLo/xHi/yHi` are screen pixels, same space `find_hovered_items`'s own
// `px`/`py` are in.
export function find_items_in_rect(items, xScale, yScale, xLo, yLo, xHi, yHi) {
    const ids = [];
    for(const item of items) {
        const inside = item.data?.some(([x, y]) => {
            const px = xScale(x), py = yScale(y);
            return px >= xLo && px <= xHi && py >= yLo && py <= yHi;
        });
        if(inside) ids.push(item._id);
    }
    return ids;
}
