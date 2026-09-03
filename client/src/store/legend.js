// Facet-based legend coloring (doc/module-plotter.rst's "Styling"): the
// generic half of "facet-selected groups of drawables get colored via
// style.css's --clr-legendN, in order; anything with no group facet at all
// gets the current colorscheme's own neutral foreground instead" -- module-
// agnostic on purpose, even though the plotter is its first (and so far
// only) caller, since the same "stable color per distinct facet value,
// neutral when unset" shape is exactly what any future per-module legend
// (diagram edges by type, table rows by category, ...) would want too.
//
// Deliberately minimal: no persistence, no manual re-assignment, no
// upper-bound-aware allocation smarter than wrapping -- just enough to give
// "unassigned reads as neutral, not as an arbitrary first color" for free.
// A real legend/data-groups editor (anticipated, not built -- see that
// doc's "Styling") would own picking *which* facet key groups a given
// module's items and let a user reorder/pin colors explicitly; this only
// ever assigns them once, fresh, in whatever order `items` iterates in.

// Matches style.css's own --clr-legend1..8 basic-palette slots (one shared
// 8-color vocabulary already used the same "cycle through, module decides
// what a color means" way by e.g. modules/graph's SinkWiringPanel.vue).
export const LEGEND_COLOR_COUNT = 8;

// One pass over `items`, assigning each distinct value seen at
// `item._facets?.[facetKey]` its own `--clr-legendN` custom-property name
// (not a resolved color -- callers still run it through their own
// resolve_css_var/getComputedStyle, same as every other CSS-var consumer in
// this app), in first-seen order, wrapping back to --clr-legend1 past 8
// distinct groups. An item with no value for `facetKey` (`undefined` or
// `null`) is skipped entirely -- it never claims a slot, and never shows up
// as a key in the returned map, so `legend_color_var` below can tell "this
// item has no group" apart from "this item's group happens to be falsy".
export function assign_legend_colors(items, facetKey) {
    const colorVarByValue = new Map();
    let nextIndex = 0;
    for(const item of items) {
        const value = item._facets?.[facetKey];
        if(value === undefined || value === null) continue;
        if(!colorVarByValue.has(value)) {
            colorVarByValue.set(value, `--clr-legend${(nextIndex % LEGEND_COLOR_COUNT) + 1}`);
            nextIndex++;
        }
    }
    return colorVarByValue;
}

// The other half: given one item and the map assign_legend_colors just
// built (over the same `facetKey`), the --clr-legendN var name it should
// use, or null when the item carries no `facetKey` facet at all -- callers
// treat null as "use my own neutral/baseline color" (e.g. --clr-fg-main),
// never as "group 0" or any other implied slot.
export function legend_color_var(item, facetKey, colorVarByValue) {
    const value = item._facets?.[facetKey];
    if(value === undefined || value === null) return null;
    return colorVarByValue.get(value) ?? null;
}
