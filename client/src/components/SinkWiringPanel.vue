<!--
  Sub-panel widget: an interactive node-and-wire view of the whole
  session's sink wiring (doc/ui-session.rst's "Selection sinks") -- every
  resource, every contextual "scope", the (read-only) resource -> scope
  attachment each resource already has, and the (editable) scope -> scope
  sink links a drag between two ports creates or a click removes.

  Built on Vue Flow (@vue-flow/core) rather than modules/graph/
  DiagramViewport.vue's own hand-rolled SVG renderer -- that one is a
  read-only, auto-laid-out view of *domain* data a source provides (an
  FSM, e.g.); this one is a small, interactive editor over the *app's own*
  wiring state (dragging, port validity, creating/deleting sinkLinks
  records), a genuinely different problem Vue Flow already solves. Reuses
  @dagrejs/dagre (already a dependency -- modules/graph/layout.js's own
  choice) only for the one-time initial placement of newly-appeared
  nodes; Vue Flow itself has no layout engine of its own, only rendering
  and interaction.

  Sketch/first pass, deliberately scoped down:
  - resource -> scope edges are read-only here (reassigning a resource is
    ConnectScopeModal.vue's/SourcesList.vue's job, not duplicated);
  - a new sink link always gets the target's first accepted payload type
    and no facetsSelector -- editing either is still ConnectScopeModal
    .vue's job, reachable the usual way from each module's own
    "Send selection to sink" affordance;
  - node positions live only in this component's own local state, not
    persisted -- reopening the panel re-lays-out anything not already
    positioned, exactly like a first visit;
  - both resource and sink edges share one edge type ('wiring') so they
    read as the same kind of thing at a glance (color = the type flowing
    through it); only a sink link's `data.linkId` makes it removable, so
    only hovering one reveals the unlink tool -- a resource edge just
    highlights, no toolbar, since removing it isn't this widget's job.
    Every context node's output port renders unconditionally too (dimmed
    when its module has no buildSinkSnapshot) rather than being omitted,
    so "this concept exists but isn't wired up here" reads differently
    from "modules don't have outputs".

  Wrapped in NavBarEntity (the same header/collapse/drag-to-relocate shell
  every other subpanel item uses, e.g. modules/graph/GraphSinkPanel.vue) --
  not just for consistency: Panel.vue's `.panel-item` is plain auto-height
  block flow, every *other* subpanel is naturally content-sized (a list, a
  form, a small debug dump) and just stacks; this is the first one that
  needs real, resolved pixel height for Vue Flow's own internal sizing to
  work at all, and a bare `height: 100%` here would resolve against that
  auto-height ancestor as `auto` -- silently collapsing to nothing (which
  is exactly what happened before this comment existed). NavBarEntity's own
  `#content { max-height: 50vh; overflow: auto }` already solves the exact
  same "how tall am I inside an unpredictable stack" problem for every
  other subpanel; the fix here is to lean on that existing cap with a
  concrete `vh`-based height instead of a `%` one, not to change Panel.vue.
-->
<template>
  <NavBarEntity :item-id="itemId" :default-opened-state="true">
    <template #header>Wiring</template>
    <template #actions><slot name="actions" /></template>

    <template #content>
    <div class="sink-wiring-panel">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :is-valid-connection="is_valid_connection"
      :nodes-connectable="true"
      fit-view-on-init
      @connect="on_connect"
      @edge-mouse-enter="hoveredEdgeId = $event.edge.id"
      @edge-mouse-leave="hoveredEdgeId = null"
    >
      <template #node-resource="nodeProps">
        <div class="wiring-node wiring-node--resource">
          <div class="wiring-node__title">{{ nodeProps.data.label }}</div>
          <div class="wiring-node__type" :style="{color: type_color(nodeProps.data.dataType)}">
            {{ nodeProps.data.dataType ?? '(unknown type)' }}
          </div>
          <Handle
            id="out" type="source" :position="Position.Right"
            :style="handle_style(nodeProps.data.dataType)"
          />
        </div>
      </template>

      <template #node-context="nodeProps">
        <div class="wiring-node wiring-node--context">
          <div class="wiring-node__title">{{ nodeProps.data.label }}</div>
          <div class="wiring-node__type">{{ nodeProps.data.dataType }}</div>

          <!-- One input port for both a resource attachment and a sink link
               (doc/data-model.rst's "Consequence for the wiring diagram"):
               now that a source resolves live the same way a sink link
               already did, both are just two kinds of edge feeding the same
               intake, distinguished only by edge style (dashed vs solid,
               see #edge-wiring below), not by which port they land on. -->
          <Handle id="in" type="target" :position="Position.Left" />
          <!-- Always rendered, not just when hasSinkOrigin -- a module
               that can't originate a sink (plot, table, sink-view) still
               *has* an output port conceptually, it's just disabled; omitting
               it entirely read as "modules don't have output ports" rather
               than "this one doesn't support it". -->
          <Handle
            id="out" type="source" :position="Position.Right"
            :connectable="nodeProps.data.hasSinkOrigin"
            :class="{'wiring-handle--disabled': !nodeProps.data.hasSinkOrigin}"
          />
        </div>
      </template>

      <template #edge-wiring="edgeProps">
        <BaseEdge
          :id="edgeProps.id" :path="edge_path(edgeProps)[0]"
          :style="{
            stroke: type_color(edgeProps.data.colorType),
            strokeDasharray: edgeProps.data.kind === 'resource' ? '4 3' : undefined
          }"
        />
        <EdgeLabelRenderer v-if="edgeProps.data.linkId && hoveredEdgeId === edgeProps.id">
          <div
            class="wiring-edge-toolbar"
            :style="{
              transform: `translate(-50%, -50%) translate(${edge_path(edgeProps)[1]}px, ${edge_path(edgeProps)[2]}px)`
            }"
          >
            <button type="button" title="Unlink" @click="remove_link(edgeProps.data.linkId)">✕</button>
          </div>
        </EdgeLabelRenderer>
      </template>
    </VueFlow>

    <p v-if="!nodes.length" class="sink-wiring-panel__empty">
      No sources or scopes yet -- add a data source or a scope to see it here.
    </p>
    </div>
    </template>
  </NavBarEntity>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useStore } from 'vuex';
import { VueFlow, Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core';
import dagre from '@dagrejs/dagre';
import NavBarEntity from '@/components/NavBarEntity.vue';
import { get_module } from '@/modules/registry';
import { send_selection_to_sink } from '@/store/sinkDispatch';
import '@vue-flow/core/dist/style.css';

// Panel.vue always passes item-id (see its own header-drag-handle use of
// it in NavBarEntity) -- forwarded straight through, this component has no
// use for it beyond that.
defineProps({
    itemId: {type: String, default: null}
});

const store = useStore();

const NODE_WIDTH = 170;
const NODE_HEIGHT = 56;

// Deterministic string -> color, so every port/edge for one payload or
// data type reads consistently across the whole diagram without a
// hand-maintained palette (modules/registry.js's own type vocabulary is
// open-ended, not a fixed enum this component could switch on).
function type_color(type) {
    if(!type || type === '*') return 'var(--clr-border-inactive)';
    let hash = 0;
    for(let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 55%, 60%)`;
}

function handle_style(type) {
    return {background: type_color(type)};
}

// Which edge (if any) the pointer is currently over -- drives the
// hover-only "unlink" toolbar below (see #edge-wiring), replacing what
// used to be an always-visible label+remove-button glued to every sink
// link. Set via VueFlow's own edgeMouseEnter/edgeMouseLeave events.
const hoveredEdgeId = ref(null);

// -- Desired nodes/edges, derived fresh from store state every time it's
// read below -- no positions live here, those are dagre's/Vue Flow's own
// concern (sync_from_store below).
function build_resource_nodes() {
    return Object.values(store.state.connection.resources).map(resource => ({
        id: `resource:${resource.name}`,
        type: 'resource',
        data: {label: resource.name, dataType: resource.type}
    }));
}

function build_context_nodes() {
    return store.getters['contexts/list'].map(ctx => {
        const module = get_module(ctx.dataType);
        return {
            id: `context:${ctx.id}`,
            type: 'context',
            data: {
                label: ctx.name,
                dataType: ctx.dataType,
                hasSinkOrigin: !!module?.buildSinkSnapshot
            }
        };
    });
}

// One shared edge type ('wiring') for both kinds -- previously resource
// edges rendered as Vue Flow's plain built-in 'default' bezier while sink
// links used a custom 'sink' type with an always-visible label+remove
// button, which read as two unrelated things on the canvas rather than
// "the same kind of connection, one of them just isn't yours to edit
// here". `colorType` is the one thing that varies -- a resource edge's
// fixed dataType vs. a sink link's chosen payloadType -- everything else
// (path, hover behavior) is identical. Only a sink link carries `linkId`;
// that's what the edge template below uses to decide whether hovering it
// offers an unlink tool at all.
function build_resource_edges() {
    return Object.values(store.state.connection.resources)
        .filter(resource => resource.contextId)
        .map(resource => ({
            id: `r2c:${resource.name}`,
            type: 'wiring', selectable: false,
            source: `resource:${resource.name}`, sourceHandle: 'out',
            target: `context:${resource.contextId}`, targetHandle: 'in',
            data: {colorType: resource.type, kind: 'resource'}
        }));
}

function build_sink_edges() {
    return store.getters['contexts/list'].flatMap(ctx =>
        store.getters['contexts/linksFrom'](ctx.id).map(link => ({
            id: `link:${link.linkId}`,
            type: 'wiring',
            source: `context:${ctx.id}`, sourceHandle: 'out',
            target: `context:${link.targetContextId}`, targetHandle: 'in',
            data: {colorType: link.payloadType, linkId: link.linkId, originContextId: ctx.id, kind: 'sink'}
        }))
    );
}

const nodes = ref([]);
const edges = ref([]);

// One-time dagre pass over the *whole* current graph, but only ever
// applied to nodes that don't already have a position -- a node the user
// has dragged keeps exactly where they left it; this only ever decides
// where a node no one has touched yet should start out (new resource, new
// scope, or the panel's very first render).
function layout_new_nodes(desiredNodes, desiredEdges, existingPositions) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({rankdir: 'LR', nodesep: 30, ranksep: 90});
    g.setDefaultEdgeLabel(() => ({}));
    for(const node of desiredNodes) g.setNode(node.id, {width: NODE_WIDTH, height: NODE_HEIGHT});
    for(const edge of desiredEdges) {
        if(g.hasNode(edge.source) && g.hasNode(edge.target)) g.setEdge(edge.source, edge.target);
    }
    dagre.layout(g);

    return Object.fromEntries(desiredNodes.map(node => {
        if(existingPositions[node.id]) return [node.id, existingPositions[node.id]];
        const {x, y} = g.node(node.id);
        return [node.id, {x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2}];
    }));
}

function sync_from_store() {
    const desiredNodes = [...build_resource_nodes(), ...build_context_nodes()];
    const desiredEdges = [...build_resource_edges(), ...build_sink_edges()];
    const existingPositions = Object.fromEntries(nodes.value.map(node => [node.id, node.position]));
    const positions = layout_new_nodes(desiredNodes, desiredEdges, existingPositions);

    nodes.value = desiredNodes.map(node => ({...node, position: positions[node.id]}));
    edges.value = desiredEdges;
}

// Re-derives on every relevant store mutation -- cheap (one session's
// worth of resources/scopes/links, never a large N) and avoids hand
// -tracking which of several independent state slices changed.
watch(
    () => [
        store.state.connection.resources,
        store.getters['contexts/list'],
        store.state.contexts.byId
    ],
    sync_from_store,
    {immediate: true, deep: true}
);

// Vue Flow calls this for two different purposes, distinguishable only by
// whether `connection.id` is set (createGraphEdges() in @vue-flow/core):
// validating one of *our own* already-supplied edges (the full edge
// object, `id` included) -- always accepted, this component already
// decided what belongs in `edges` -- versus validating a *new* interactive
// drag connection (a bare {source, sourceHandle, target, targetHandle},
// never an `id`), where only a context's own 'out' port dragged onto
// another context's own 'in' port should be allowed (a resource is never a
// sink origin, and the 'in' port -- shared by both resource and sink edges
// now, doc/data-model.rst's "Consequence for the wiring diagram" -- is only
// ever driven *from a resource* by connection.js's own resource-assignment
// flow, ConnectScopeModal.vue's 'resource' kind/SourcesList.vue, not by
// dragging a wire here; see the header comment's "deliberately scoped
// down"). `sourceNode.type === 'context'` is what excludes a resource node
// from this drag-created path -- a resource's own 'out' handle shares the
// same id, but never the same node type.
function is_valid_connection(connection, {sourceNode, targetNode}) {
    if(connection.id) return true;
    return connection.sourceHandle === 'out' && connection.targetHandle === 'in'
        && sourceNode.type === 'context' && targetNode.type === 'context'
        && sourceNode.id !== targetNode.id;
}

// Picks the target's own first accepted payload type (or '*') -- the same
// default ConnectScopeModal.vue's picker starts on. Editing that choice,
// or adding a facetsSelector, is still that modal's job (see header
// comment); dragging a wire here is the fast path for the common case.
async function on_connect(connection) {
    const originContextId = connection.source.slice('context:'.length);
    const targetContextId = connection.target.slice('context:'.length);
    const targetCtx = store.getters['contexts/context'](targetContextId);
    const targetModule = get_module(targetCtx?.dataType);
    const accepted = targetModule?.acceptsPayloadTypes;
    const payloadType = accepted === '*' ? '*' : accepted?.[0];
    if(!payloadType) return;

    const linkId = await store.dispatch('contexts/create_sink_link', {
        contextId: originContextId,
        targetDataType: targetCtx.dataType,
        targetContextId,
        payloadType,
        facetsSelector: null
    });
    send_selection_to_sink(store, {originContextId, linkId});
}

function remove_link(linkId) {
    const edge = edges.value.find(candidate => candidate.data?.linkId === linkId);
    if(!edge) return;
    store.commit('contexts/remove_sink_link', {contextId: edge.data.originContextId, linkId});
}

function edge_path(edgeProps) {
    return getBezierPath({
        sourceX: edgeProps.sourceX, sourceY: edgeProps.sourceY, sourcePosition: edgeProps.sourcePosition,
        targetX: edgeProps.targetX, targetY: edgeProps.targetY, targetPosition: edgeProps.targetPosition
    });
}
</script>

<style scoped>
.sink-wiring-panel {
  position: relative;
  /* Not 100% -- see this file's header comment: NavBarEntity's own
     #content is auto-height (capped at max-height: 50vh), not a definite
     height a percentage could resolve against. A fixed viewport-relative
     height sidesteps that the same way NavBarEntity's own cap does,
     comfortably under it so this never triggers *its* scrollbar too --
     Vue Flow manages its own pan/zoom inside this box regardless of how
     much graph content there is. */
  height: 42vh;
  background: var(--clr-bg-panel);
  color: var(--clr-fg-panel);
  font-size: 9pt;
  overflow: hidden;
}

.sink-wiring-panel :deep(.vue-flow) {
  height: 100%;
}

.sink-wiring-panel :deep(.vue-flow__edge-path) {
  stroke-width: 1.5;
}

.sink-wiring-panel__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--clr-fg-main-muted);
  font-style: italic;
  pointer-events: none;
}

.wiring-node {
  position: relative;
  width: 170px;
  padding: 6pt 8pt;
  border: 1px solid var(--clr-border-inactive);
  border-radius: 4pt;
  background: var(--clr-bg-panel);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.wiring-node--resource {
  border-style: dashed;
}

.wiring-node__title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wiring-node__type {
  color: var(--clr-fg-main-muted);
  font-size: 0.85em;
}

/* Vue Flow's own theme-default.css isn't imported (kept fully app-themed
   instead, see the top-level import comment) -- base handle shape/size
   would otherwise be entirely unstyled (a near-invisible ~5px box), which
   is exactly why a module's output port used to be indistinguishable even
   when it did render. Target = circle (the default shape below), source =
   a rounded square -- silhouette alone tells in from out at a glance,
   without needing to trace which side of the node it's on. */
.sink-wiring-panel :deep(.vue-flow__handle) {
  width: 9px;
  height: 9px;
  border: 1px solid var(--clr-bg-panel);
  border-radius: 50%;
  background: var(--clr-border-inactive);
}

.sink-wiring-panel :deep(.vue-flow__handle.source) {
  border-radius: 3px;
}

.wiring-handle--disabled {
  opacity: 0.35;
}

.wiring-edge-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  padding: 1pt 3pt;
  border-radius: 3pt;
  background: var(--clr-bg-panel);
  border: 1px solid var(--clr-border-inactive);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  pointer-events: all;
}

.wiring-edge-toolbar button {
  line-height: 1;
  padding: 0 2pt;
}
</style>
