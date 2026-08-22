// Composite id scheme for this module's merged board (doc/module-graph.rst's
// "Boards"/"Selection and forwarding"): several data sources may attach to
// the same board, and this module's edges *reference* node ids, so a node's
// or edge's own source-local id must be namespaced by its contributing
// resource before it can be used as a dagre graph key or a shared-selection
// item id -- otherwise two resources' same-named nodes/edges would collide
// in both. One composite id serves both roles (dagre's own node/edge key,
// and this board's selection_<ctx> item id) rather than keeping two separate
// schemes.
//
// Mirrors modules/three-view/utils.js's full_geo_id/destruct_geo_id
// (`geoID@srcID`), extended with a leading 'node:'/'edge:' kind tag -- this
// module's nodes and edges share one selection-id namespace (unlike
// three-view, which only ever selects one kind of thing), so the kind must
// be recoverable from the id alone.
const KIND_DELIMITER = ':';
const RESOURCE_DELIMITER = '::';

export function selection_node_id(resourceName, localId) {
    return `node${KIND_DELIMITER}${resourceName}${RESOURCE_DELIMITER}${localId}`;
}

export function selection_edge_id(resourceName, localId) {
    return `edge${KIND_DELIMITER}${resourceName}${RESOURCE_DELIMITER}${localId}`;
}

// A cluster (doc/module-graph.rst's "Clusters") is a dagre compound-graph
// parent, not a selectable item -- it shares this same composite-id scheme
// purely so it can be namespaced by resource and used as a dagre graph key
// (layout.js's setParent) without colliding with another resource's
// same-named cluster, not because it participates in selection/hover.
export function selection_cluster_id(resourceName, localId) {
    return `cluster${KIND_DELIMITER}${resourceName}${RESOURCE_DELIMITER}${localId}`;
}

// Inverse of the three functions above: {kind: 'node'|'edge'|'cluster', resourceName, localId}.
export function destruct_selection_id(compositeId) {
    const kindSep = compositeId.indexOf(KIND_DELIMITER);
    const kind = compositeId.slice(0, kindSep);
    const rest = compositeId.slice(kindSep + 1);
    const resourceSep = rest.indexOf(RESOURCE_DELIMITER);
    return {
        kind,
        resourceName: rest.slice(0, resourceSep),
        localId: rest.slice(resourceSep + RESOURCE_DELIMITER.length)
    };
}
