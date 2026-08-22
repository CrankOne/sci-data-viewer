// dagre layout wrapper (doc/module-graph.rst's "Implementation"): hands
// dagre only the layout problem -- building a dagre.graphlib.Graph from
// this board's merged nodes/edges (already composite-id'd, see ids.js),
// calling dagre.layout(), and reading back per-node/per-edge geometry.
// Everything downstream (SVG rendering) is plain Vue -- see
// DiagramNode.vue/DiagramEdge.vue -- deliberately not dagre-d3, which would
// mutate a D3-owned SVG subtree directly instead of leaving rendering to
// this module's own reactive components.
import dagre from '@dagrejs/dagre';

export const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
    direction: 'TB',
    align: null,
    ranker: 'network-simplex',
    nodeSep: 50,
    rankSep: 70,
    edgeSep: 20
});

export function make_default_layout_options() {
    return {...DEFAULT_LAYOUT_OPTIONS};
}

// Merges a payload's own `layout` hint (doc/module-graph.rst's "Data")
// under the built-in defaults -- the lowest-priority layer; a diagram's own
// explicit local override (store/graphLayout.js) is applied on top of this
// by the caller, never the reverse (doc's "Layout").
export function merge_layout_defaults(payloadHint) {
    return {...DEFAULT_LAYOUT_OPTIONS, ...(payloadHint ?? {})};
}

// --- Node sizing (doc's "Nodes": "derived from the label's measured
// extent when width/height are not given explicitly") ---

const NODE_FONT = '12px sans-serif';
const NODE_PADDING_X = 12;
const MIN_NODE_WIDTH = 60;
const DEFAULT_NODE_HEIGHT = 40;

// Fixed sizes for the five UML pseudostate shapes (doc's "Pseudostate
// shapes") -- never label-measured, unlike the four original shapes: a
// pseudostate carries no meaningful name to size around. `bar` (fork/join)
// is direction-aware -- wide+short for a top-to-bottom/bottom-to-top
// layout (branches fan out below/above it), narrow+tall for left-to-right/
// right-to-left (branches fan out to the side).
const CIRCLE_FILLED_DIAMETER = 14;
const CIRCLE_RINGED_DIAMETER = 20;
const TERMINATE_DIAMETER = 18;
const BAR_LENGTH = 80;
const BAR_THICKNESS = 8;

function pseudostate_size(shape, direction) {
    switch(shape) {
    case 'circle-filled': return {width: CIRCLE_FILLED_DIAMETER, height: CIRCLE_FILLED_DIAMETER};
    case 'circle-ringed': return {width: CIRCLE_RINGED_DIAMETER, height: CIRCLE_RINGED_DIAMETER};
    case 'terminate': return {width: TERMINATE_DIAMETER, height: TERMINATE_DIAMETER};
    case 'bar':
        return (direction === 'LR' || direction === 'RL')
            ? {width: BAR_THICKNESS, height: BAR_LENGTH}
            : {width: BAR_LENGTH, height: BAR_THICKNESS};
    default: return null;
    }
}

// A detached, never-attached <canvas> 2D context is the standard cheap way
// to measure text metrics without a real DOM layout pass -- lazily created
// since this module (like every other) only touches the DOM from within a
// component's own lifecycle, never at import time.
let measureCtx = null;
function measure_text_width(text) {
    if(!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = NODE_FONT;
    return measureCtx.measureText(text ?? '').width;
}

function measured_node_size(node, direction) {
    if(node.width == null && node.height == null) {
        const fixed = pseudostate_size(node.shape, direction);
        if(fixed) return fixed;
    }
    const width = node.width ?? Math.max(MIN_NODE_WIDTH, Math.ceil(measure_text_width(node.label)) + NODE_PADDING_X * 2);
    const height = node.height ?? DEFAULT_NODE_HEIGHT;
    return {width, height};
}

// `nodes`/`edges` are this board's already-merged, composite-id'd items
// (store/graphBoard.js's allNodes/allEdges getters, ids.js) -- every node
// has a `compositeId`, every edge a `compositeId` plus `from`/`to` already
// rewritten to their endpoints' compositeId; a node may also carry a
// `cluster` field, already rewritten to a cluster's own compositeId the
// same way (doc's "Clusters"). `clusters` is this board's already-merged,
// composite-id'd cluster list (store/graphBoard.js's allClusters getter).
// `layoutOptions` is the *effective* options object (merge_layout_defaults(),
// further overridden by the diagram's own local state, store/graphLayout.js
// -- see this module's "Diagrams" doc section).
//
// Returns {nodes, edges, clusters, width, height}: `nodes`/`edges`/
// `clusters` are the same input objects with layout geometry merged in
// (x/y/width/height for a node or cluster -- x/y are dagre's node *center*;
// points for an edge, a polyline through dagre's own routing, not a
// straight line between two node centers); width/height is the whole
// diagram's own bounding box, e.g. for sizing the SVG viewBox -- already
// accounts for cluster geometry, dagre's own `g.graph()` bbox needs no
// separate handling for that (confirmed against a real compound-graph
// spike: a cluster's bounding box is computed and folded into the whole
// graph's bbox the same as any node's).
export function compute_layout(nodes, edges, layoutOptions, clusters = []) {
    const g = new dagre.graphlib.Graph({multigraph: true, compound: true});
    g.setGraph({
        rankdir: layoutOptions.direction,
        align: layoutOptions.align || undefined,
        ranker: layoutOptions.ranker,
        nodesep: layoutOptions.nodeSep,
        ranksep: layoutOptions.rankSep,
        edgesep: layoutOptions.edgeSep
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Clusters are dagre nodes too (its compound-graph model: a cluster IS
    // a node, sized automatically from its children's bounding box, see
    // doc's "Clusters") -- registered before any child sets it as parent.
    for(const cluster of clusters) {
        g.setNode(cluster.compositeId, {label: cluster.label});
    }
    for(const node of nodes) {
        const {width, height} = measured_node_size(node, layoutOptions.direction);
        g.setNode(node.compositeId, {width, height});
    }
    for(const node of nodes) {
        if(node.cluster && g.hasNode(node.cluster)) g.setParent(node.compositeId, node.cluster);
    }
    // Named by the edge's own compositeId (dagre's multigraph {v, w, name}
    // key) so two edges between the same pair of nodes -- e.g. a state's
    // self-loop plus a distinct forward transition -- never collide.
    for(const edge of edges) {
        if(!g.hasNode(edge.from) || !g.hasNode(edge.to)) continue; // invalid edge, doc's "Edges"
        g.setEdge(edge.from, edge.to, {}, edge.compositeId);
    }

    dagre.layout(g);

    const outNodes = nodes
        .filter(node => g.hasNode(node.compositeId))
        .map(node => {
            const laidOut = g.node(node.compositeId);
            return {...node, x: laidOut.x, y: laidOut.y, width: laidOut.width, height: laidOut.height};
        });

    const outClusters = clusters
        .filter(cluster => g.hasNode(cluster.compositeId))
        .map(cluster => {
            const laidOut = g.node(cluster.compositeId);
            return {...cluster, x: laidOut.x, y: laidOut.y, width: laidOut.width, height: laidOut.height};
        });

    const outEdges = edges
        .filter(edge => g.hasEdge(edge.from, edge.to, edge.compositeId))
        .map(edge => {
            const laidOut = g.edge(edge.from, edge.to, edge.compositeId);
            return {...edge, points: laidOut.points};
        });

    const bbox = g.graph();
    return {nodes: outNodes, edges: outEdges, clusters: outClusters, width: bbox.width ?? 0, height: bbox.height ?? 0};
}
