// Hand-rolled 2D pan/zoom affine transform for the diagram viewport's SVG
// group (doc/module-graph.rst's "Rendering") -- deliberately not d3-zoom:
// a 2D pan/zoom over one SVG group is a few lines, and unlike
// modules/plotter's zoom.js (composed onto a D3 scale's *range* because
// each axis can independently be linear or logarithmic, see that file's
// header comment), this module has no per-axis scale to compose onto --
// both dimensions here are always plain screen-pixel space, so the
// transform is simpler, not merely smaller.

export function make_identity_transform() {
    return {k: 1, tx: 0, ty: 0};
}

// SVG `transform` attribute value for one <g> wrapping every node/edge.
export function to_svg_transform(transform) {
    return `translate(${transform.tx}, ${transform.ty}) scale(${transform.k})`;
}

// Zoom by `factor` (< 1 zooms out) around screen pixel (px, py), keeping
// whatever is currently at that pixel fixed there.
export function zoom_around(transform, px, py, factor) {
    const k = transform.k * factor;
    return {
        k,
        tx: px - factor * (px - transform.tx),
        ty: py - factor * (py - transform.ty)
    };
}

export function pan_by(transform, dxPx, dyPx) {
    return {k: transform.k, tx: transform.tx + dxPx, ty: transform.ty + dyPx};
}

// A transform that fits `bbox` (the diagram's own dagre-computed
// width/height, layout.js's compute_layout) centered within
// `viewportWidthPx`x`viewportHeightPx`, e.g. for the initial view and a
// "fit to view" toolbar action. Never zooms in past 1:1 for a diagram
// smaller than its viewport -- a handful of FSM states blown up to fill an
// oversized panel would read worse than left at native size.
export function fit_transform(bbox, viewportWidthPx, viewportHeightPx, padding = 40) {
    const contentWidth = Math.max(bbox.width, 1);
    const contentHeight = Math.max(bbox.height, 1);
    const availableWidth = Math.max(viewportWidthPx - padding * 2, 1);
    const availableHeight = Math.max(viewportHeightPx - padding * 2, 1);
    const k = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
    return {
        k,
        tx: (viewportWidthPx - contentWidth * k) / 2,
        ty: (viewportHeightPx - contentHeight * k) / 2
    };
}
