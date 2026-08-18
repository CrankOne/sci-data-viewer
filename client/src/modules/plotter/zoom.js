// Pixel-space affine zoom/pan transform for the MP's rectangular-zoom,
// pan and wheel-zoom interactions (doc/module-plotter.rst's "Plotting
// layout" section).
//
// Deliberately composed onto a scale's RANGE rather than its domain: a d3
// continuous scale always interpolates linearly between its two range
// endpoints, whatever the domain-side transform is (identity for a linear
// scale, log for scaleLog) -- see scales.js's D3-domain disambiguation.
// That means an affine transform {k, t} of the range endpoints is exactly
// equivalent to applying the same affine transform to the scale's pixel
// *output*, for either scale type, so none of the functions below need to
// know or care whether an axis is linear or logarithmic.

export function make_identity_transform() {
    return {k: 1, t: 0};
}

export function apply_transform(scale, transform) {
    const [r0, r1] = scale.range();
    return scale.copy().range([r0 * transform.k + transform.t, r1 * transform.k + transform.t]);
}

// Zoom by `factor` around screen pixel `px` (< 1 zooms in), keeping
// whatever is currently at `px` fixed there.
export function zoom_around(transform, px, factor) {
    return {
        k: transform.k * factor,
        t: px - factor * (px - transform.t)
    };
}

export function pan_by(transform, deltaPx) {
    return {k: transform.k, t: transform.t + deltaPx};
}

// Rescales so that the current on-screen pixel interval [px0, px1]
// (px0 < px1) fills [0, extentPx] instead -- "zoom to this rectangle".
export function zoom_to_rect(transform, px0, px1, extentPx) {
    const a = extentPx / (px1 - px0);
    return {
        k: a * transform.k,
        t: a * (transform.t - px0)
    };
}
