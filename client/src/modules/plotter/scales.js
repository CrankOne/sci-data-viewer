// Builds a D3 scale for one axis of a transformation domain
// (doc/module-plotter.rst's "Domains" section). Naming note from that same
// section: the scale's own `.domain()`/`.range()` below is D3's domain/range
// (an axis's numeric input range and pixel output range) -- distinct from,
// and not to be confused with, this module's own *transformation domain*
// concept (a named, per-item-opt-in real-coordinates-to-pixels mapping).
import { scaleLinear, scaleLog } from 'd3-scale';

export function make_scale({scaleType = 'linear', extent, rangePx}) {
    switch(scaleType) {
        case 'log2':
            return scaleLog().base(2).domain(extent).range(rangePx);
        case 'log10':
            return scaleLog().base(10).domain(extent).range(rangePx);
        case 'linear':
        default:
            return scaleLinear().domain(extent).range(rangePx);
    }
}
