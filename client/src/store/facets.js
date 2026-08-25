// The `_facets` convention (doc/module-3d-viewer.rst, doc/module-graph.rst,
// doc/module-plotter.rst): free-form `{name: value}` metadata a source MAY
// tag an item with, for grouping/filtering (facet presets, store/selection
// .js) and, eventually, resource-link facet filtering (doc/data-model.rst).
//
// A source is free to omit `_facets` entirely -- every item still needs at
// least one facet to be meaningfully filterable/groupable by "which source
// did this come from", so each contextual module's own live getter (e.g.
// modules/three-view/store/view3D.js's `geoData`) runs every item through
// this on the way in, merging a `dataSource` facet (the owning resource's
// own name) into whatever `_facets` the source did or didn't supply -- set
// after spreading the source's own facets, so `dataSource` always wins even
// if a source tried to supply one of its own; unlike a derived facet such
// as ItemsTree.vue's "transf.group" (which a source-supplied value of the
// same name is allowed to override), a source has no business claiming to
// be a different one.
export function with_data_source_facet(item, resourceName) {
    return {...item, _facets: {...(item._facets ?? {}), dataSource: resourceName}};
}

// AND-matches a `facetsSelector` (a plain `{[facetKey]: value}` object, or
// null/undefined for "no filter") against one item's own `_facets`. Every
// entry in the selector must be present and equal on the item -- an item
// with no `_facets` at all (or missing the given key) fails any non-empty
// selector, never matches by omission. Shared by both kinds of link this
// app has (doc/data-model.rst): a sink link's own facetsSelector
// (store/sinkDispatch.js's deliver_to_sink) and a resource->scope
// attachment's (modules/*/store/*.js's live getters) -- same predicate,
// same field, just applied at two different points item lists pass
// through.
export function matches_facets_selector(facets, selector) {
    if(!selector) return true;
    if(!facets) return false;
    return Object.entries(selector).every(([key, value]) => facets[key] === value);
}
