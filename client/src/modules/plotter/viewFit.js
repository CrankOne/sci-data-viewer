// "Fit to content" for the MP (doc/module-plotter.rst's "Plotting layout"):
// computes an x/y transform pair (zoom.js's {k, t} shape) that brings every
// currently-visible primitive's data extent into view, the same way a
// rectangular-zoom drag does -- just fed a computed data-space bbox instead
// of a mouse drag rectangle. Independent per-axis (no shared aspect ratio),
// unlike modules/graph/transform.js's fit_transform: X/Y are independent
// scientific axes here, not a geometric diagram that needs its shape
// preserved.
import { zoom_to_rect } from './zoom';

// Only the primitive types draw.js actually knows how to draw contribute to
// the extent -- mirrors PlotViewport.vue's own redraw() filter.
const FITTABLE_TYPES = new Set(['markers', 'polyline']);

// Returns [lo, hi] (lo <= hi) or null if `items` has nothing matching
// `domainName` to measure.
export function compute_data_extent(items, domainName) {
    let xLo = Infinity, xHi = -Infinity, yLo = Infinity, yHi = -Infinity;
    let any = false;
    for(const item of items) {
        if(item._transfDomain !== domainName || !FITTABLE_TYPES.has(item._type))
            continue;
        for(const [x, y] of item.data) {
            any = true;
            if(x < xLo) xLo = x;
            if(x > xHi) xHi = x;
            if(y < yLo) yLo = y;
            if(y > yHi) yHi = y;
        }
    }
    if(!any) return null;
    return {x: [xLo, xHi], y: [yLo, yHi]};
}

// Only called on a degenerate axis (lo === hi -- a single point, or every
// point sharing one coordinate, e.g. a vertical/horizontal line). Additive
// padding is meaningless on a log axis, so the two scale families pad
// differently; both are fixed, not data-relative -- there's no single right
// answer for "how small a floor" across wildly different scales, so this
// deliberately doesn't try to guess one.
export function pad_degenerate_extent([lo, hi], scaleType) {
    if(lo !== hi) return [lo, hi];
    if(scaleType === 'log2' || scaleType === 'log10')
        return [lo / 10, hi * 10];
    return [lo - 1, hi + 1];
}

// Returns {xTransform, yTransform} (zoom.js's {k, t} shape) or null when
// `items` has nothing to fit to -- caller's job to fall back to the
// domain's own default view box in that case (PlotViewport.vue's
// reset_all_transforms).
export function compute_fit_transforms(items, domain, baseXScale, baseYScale, mpWidth, mpHeight, padding = 20) {
    const extent = compute_data_extent(items, domain.name);
    if(!extent) return null;

    const [xLo, xHi] = pad_degenerate_extent(extent.x, domain.x.scaleType);
    const [yLo, yHi] = pad_degenerate_extent(extent.y, domain.y.scaleType);

    const px0 = baseXScale(xLo), px1 = baseXScale(xHi);
    const [xPxLo, xPxHi] = px0 < px1 ? [px0, px1] : [px1, px0];
    const xTransform = zoom_to_rect({k: 1, t: 0}, xPxLo - padding, xPxHi + padding, mpWidth);

    const py0 = baseYScale(yLo), py1 = baseYScale(yHi);
    const [yPxLo, yPxHi] = py0 < py1 ? [py0, py1] : [py1, py0];
    const yTransform = zoom_to_rect({k: 1, t: 0}, yPxLo - padding, yPxHi + padding, mpHeight);

    return {xTransform, yTransform};
}
