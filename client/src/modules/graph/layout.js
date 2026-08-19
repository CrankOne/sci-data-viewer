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

function measured_node_size(node) {
    const width = node.width ?? Math.max(MIN_NODE_WIDTH, Math.ceil(measure_text_width(node.label)) + NODE_PADDING_X * 2);
    const height = node.height ?? DEFAULT_NODE_HEIGHT;
    return {width, height};
}

// `nodes`/`edges` are this board's already-merged, composite-id'd items
// (store/graphBoard.js's allNodes/allEdges getters, ids.js) -- every node
// has a `compositeId`, every edge a `compositeId` plus `from`/`to` already
// rewritten to their endpoints' compositeId. `layoutOptions` is the
// *effective* options object (merge_layout_defaults(), further overridden
// by the diagram's own local state, store/graphLayout.js -- see this
// module's "Diagrams" doc section).
//
// Returns {nodes, edges, width, height}: `nodes`/`edges` are the same
// input objects with layout geometry merged in (x/y/width/height for a
// node -- x/y are dagre's node *center*; points for an edge, a polyline
// through dagre's own routing, not a straight line between two node
// centers); width/height is the whole diagram's own bounding box, e.g. for
// sizing the SVG viewBox.
export function compute_layout(nodes, edges, layoutOptions) {
    const g = new dagre.graphlib.Graph({multigraph: true});
    g.setGraph({
        rankdir: layoutOptions.direction,
        align: layoutOptions.align || undefined,
        ranker: layoutOptions.ranker,
        nodesep: layoutOptions.nodeSep,
        ranksep: layoutOptions.rankSep,
        edgesep: layoutOptions.edgeSep
    });
    g.setDefaultEdgeLabel(() => ({}));

    for(const node of nodes) {
        const {width, height} = measured_node_size(node);
        g.setNode(node.compositeId, {width, height});
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

    const outEdges = edges
        .filter(edge => g.hasEdge(edge.from, edge.to, edge.compositeId))
        .map(edge => {
            const laidOut = g.edge(edge.from, edge.to, edge.compositeId);
            return {...edge, points: laidOut.points};
        });

    const bbox = g.graph();
    return {nodes: outNodes, edges: outEdges, width: bbox.width ?? 0, height: bbox.height ?? 0};
}
