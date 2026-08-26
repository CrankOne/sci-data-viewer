<!--
  App-wide widget (store/modules/layout.js's 'wiring' leaf kind, rendered
  by components/Panel.vue -- not a module, not a subpanel, see that leaf
  kind's own header comment): an interactive node-and-wire view of the
  whole session's sink wiring (doc/ui-session.rst's "Selection sinks") --
  every resource, every contextual "scope", and both the resource -> scope
  attachments and the scope -> scope sink links a drag between two ports
  (or the context menu's "Connect output") creates, and a right-click
  removes/edits either kind identically.

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

  A resource -> scope edge and a sink link are now full peers, not just in
  how they're drawn (doc/data-model.rst's "Consequence for the wiring
  diagram") but in what they carry: both have an optional facetsSelector
  narrowing their own membership rule (the resource's own field,
  connection.js's add_resource; a sink link's, store/modules/contexts.js's
  sinkLinks), both editable here via the same "Assign facet…" context-menu
  item, both removable via "Unlink" -- see on_edge_context_menu below for
  where each kind's actions actually differ (which store call each makes).

  - node positions live only in this component's own local state, not
    persisted -- reopening the widget re-lays-out anything not already
    positioned, exactly like a first visit;
  - both resource and sink edges share one edge type ('wiring') so they
    read as the same kind of thing at a glance (color = the type flowing
    through it, dashed vs solid = which kind); no hover-revealed button on
    the edge itself (tried it, an early version's unlink button sitting
    under the pointer would cover the edge and steal the hover state right
    back off it, jittering on/off) -- both "Unlink" and "Assign facet…"
    live in the right-click menu only;
  - every context node's output port renders unconditionally (dimmed when
    its module has no buildSinkSnapshot) rather than being omitted, so
    "this concept exists but isn't wired up here" reads differently from
    "modules don't have outputs".
-->
<template>
  <div class="sink-wiring-panel">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :is-valid-connection="is_valid_connection"
      :nodes-connectable="true"
      fit-view-on-init
      @connect="on_connect"
      @node-mouse-enter="hoveredNodeId = $event.node.id"
      @node-mouse-leave="hoveredNodeId = null"
      @edge-mouse-enter="hoveredEdgeId = $event.edge.id"
      @edge-mouse-leave="hoveredEdgeId = null"
      @node-context-menu="on_node_context_menu"
      @edge-context-menu="on_edge_context_menu"
      @pane-context-menu="on_pane_context_menu"
    >
      <template #node-resource="nodeProps">
        <div
          class="wiring-node wiring-node--resource"
          :class="{'wiring-node--hovered': hoveredNodeId === nodeProps.id}"
        >
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
        <div
          class="wiring-node wiring-node--context"
          :class="{'wiring-node--hovered': hoveredNodeId === nodeProps.id}"
        >
          <div class="wiring-node__title">{{ nodeProps.data.label }}</div>
          <div class="wiring-node__type">{{ nodeProps.data.dataType }}</div>

          <!-- One input port for both a resource attachment and a sink link
               (doc/data-model.rst's "Consequence for the wiring diagram"):
               both are just two kinds of edge feeding the same intake,
               distinguished only by edge style (dashed vs solid, see
               #edge-wiring below), not by which port they land on. -->
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
            strokeWidth: hoveredEdgeId === edgeProps.id ? 3 : 1.5,
            strokeDasharray: edgeProps.data.kind === 'resource' ? '4 3' : undefined
          }"
        />
      </template>
    </VueFlow>

    <p v-if="!nodes.length" class="sink-wiring-panel__empty">
      No sources or scopes yet -- right-click empty space to add one.
    </p>

    <ContextMenu
      v-if="contextMenu"
      :x="contextMenu.x" :y="contextMenu.y" :items="contextMenu.items"
      @close="contextMenu = null"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useStore } from 'vuex';
import { VueFlow, Handle, Position, BaseEdge, getBezierPath } from '@vue-flow/core';
import dagre from '@dagrejs/dagre';
import ContextMenu from '@/components/ContextMenu.vue';
import { get_module, all_modules } from '@/modules/registry';
import { send_selection_to_sink } from '@/store/sinkDispatch';
import { create_scene_with_viewport, remove_scene_with_confirmation } from '@/sceneCreation';
import '@vue-flow/core/dist/style.css';

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

// Hover state driving highlight styling below (node border, edge stroke
// width). Ports deliberately don't get their own hover state -- tried,
// wasn't worth it: their scale transform's center sits at the handle's own
// corner rather than the pointer, which reads as jumpy rather than useful.
const hoveredNodeId = ref(null);
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
// (path, hover behavior) is identical. Only a sink link carries `linkId`
// (a resource edge carries `resourceName` instead) -- that's what
// on_edge_context_menu below branches on to know which store calls each
// kind's "Assign facet…"/"Unlink" should actually make.
function build_resource_edges() {
    return Object.values(store.state.connection.resources)
        .filter(resource => resource.contextId)
        .map(resource => ({
            id: `r2c:${resource.name}`,
            type: 'wiring',
            source: `resource:${resource.name}`, sourceHandle: 'out',
            target: `context:${resource.contextId}`, targetHandle: 'in',
            data: {colorType: resource.type, kind: 'resource', resourceName: resource.name}
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
// scope, or the widget's very first render).
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
// never an `id`), which must land on a context's own 'in' port either way.
// A context source creates a sink link (any target context, own type
// checked in on_connect below via acceptsPayloadTypes, same as a sink link
// always could); a resource source reattaches it (only a target context of
// the *same* dataType -- unlike a sink link's payload-type-based
// acceptance, a resource attachment has no type-conversion story, so this
// is checked here rather than left to fail inside on_connect).
function is_valid_connection(connection, {sourceNode, targetNode}) {
    if(connection.id) return true;
    if(connection.sourceHandle !== 'out' || connection.targetHandle !== 'in' || targetNode.type !== 'context')
        return false;
    if(sourceNode.type === 'context') return sourceNode.id !== targetNode.id;
    if(sourceNode.type === 'resource') return sourceNode.data.dataType === targetNode.data.dataType;
    return false;
}

// A resource source reattaches it to the target scope directly -- no modal
// needed, unlike ConnectScopeModal's 'resource' kind (still reachable via
// the resource node's own "Connect output" context-menu item for the same
// effect): there's no payload-type/facet decision to make at connect time,
// only which scope, and is_valid_connection above already guaranteed a
// dataType match. A context source picks the target's own first accepted
// payload type (or '*') -- the same default ConnectScopeModal.vue's picker
// starts on; editing that choice, or adding a facetsSelector, is still
// that modal's/the edge's own "Assign facet…" job.
async function on_connect(connection) {
    if(connection.source.startsWith('resource:')) {
        const resourceName = connection.source.slice('resource:'.length);
        const targetContextId = connection.target.slice('context:'.length);
        await store.dispatch('connection/reassign_resource_context', {name: resourceName, contextId: targetContextId});
        return;
    }

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

//
// Right-click context menus {{{

const contextMenu = ref(null); // {x, y, items} | null

// Opens the connect-scope picker in its 'sink' mode -- the one remaining
// way to send a scope's selection to a sink, now that each module's own
// former "Send selection to sink" button (DiagramViewport.vue's
// open_sink_picker, ItemsTree.vue's own) was retired in this widget's
// favor -- for a scope node, its own selection; for a resource node,
// ConnectScopeModal's 'resource' kind reassigns which scope the resource's
// data flows into (mirrors SourceListItem.vue's own "Connect to scope"
// button).
function connect_scope_output(contextId) {
    store.commit('ui/open_modal', {
        name: 'connect-scope',
        props: {kind: 'sink', originContextId: contextId, dataType: 'sink-view'}
    });
}

function connect_resource_output(name, dataType) {
    store.commit('ui/open_modal', {name: 'connect-scope', props: {kind: 'resource', name, dataType}});
}

function rename_scope(contextId) {
    const ctx = store.getters['contexts/context'](contextId);
    const name = window.prompt('Rename scope', ctx?.name ?? '');
    if(name && name.trim()) store.commit('contexts/rename_context', {id: contextId, name});
}

async function delete_scope(contextId) {
    await remove_scene_with_confirmation(store, contextId);
}

function assign_sink_facet(originContextId, linkId) {
    store.commit('ui/open_modal', {name: 'facet-selector', props: {kind: 'sink', contextId: originContextId, linkId}});
}

function assign_resource_facet(resourceName) {
    store.commit('ui/open_modal', {name: 'facet-selector', props: {kind: 'resource', resourceName}});
}

// "Unlink" for a resource edge -- disconnects the resource from its scope
// (contextId back to null) without deleting the resource itself, the
// resource-edge analogue of a sink link's own Unlink (which removes the
// link record but never touches either endpoint). Distinct from the
// resource *node's* own "Remove source", which deletes the resource
// outright; reassign_resource_context already treats a plain field flip
// as the whole mechanism (doc/data-model.rst), so `contextId: null` needs
// no special-casing here.
function disconnect_resource(resourceName) {
    store.dispatch('connection/reassign_resource_context', {name: resourceName, contextId: null});
}

function on_node_context_menu({event, node}) {
    event.preventDefault();
    if(node.type === 'context') {
        const contextId = node.id.slice('context:'.length);
        contextMenu.value = {
            x: event.clientX, y: event.clientY,
            items: [
                {label: 'Connect output', action: () => connect_scope_output(contextId)},
                {label: 'Rename', action: () => rename_scope(contextId)},
                {label: 'Delete', action: () => delete_scope(contextId)}
            ]
        };
    } else if(node.type === 'resource') {
        const resourceName = node.id.slice('resource:'.length);
        contextMenu.value = {
            x: event.clientX, y: event.clientY,
            items: [
                {label: 'Connect output', action: () => connect_resource_output(resourceName, node.data.dataType)},
                {label: 'Remove source', action: () => store.dispatch('connection/remove_resource', resourceName)}
            ]
        };
    }
}

// Both edge kinds get the same two-item menu -- "Assign facet…" and
// "Unlink" -- since a resource->scope attachment now carries its own
// facetsSelector too (doc/data-model.rst's "One input concept per scope,
// not two"), same as a sink link's; only what each actually edits/removes
// differs (see assign_sink_facet/assign_resource_facet and
// remove_link/disconnect_resource above).
function on_edge_context_menu({event, edge}) {
    event.preventDefault();
    if(edge.data?.linkId) {
        const {linkId, originContextId} = edge.data;
        contextMenu.value = {
            x: event.clientX, y: event.clientY,
            items: [
                {label: 'Assign facet…', action: () => assign_sink_facet(originContextId, linkId)},
                {label: 'Unlink', action: () => remove_link(linkId)}
            ]
        };
    } else if(edge.data?.kind === 'resource') {
        const {resourceName} = edge.data;
        contextMenu.value = {
            x: event.clientX, y: event.clientY,
            items: [
                {label: 'Assign facet…', action: () => assign_resource_facet(resourceName)},
                {label: 'Unlink', action: () => disconnect_resource(resourceName)}
            ]
        };
    }
}

function on_pane_context_menu(event) {
    event.preventDefault();
    const scopeItems = all_modules()
        .filter(mod => mod.contextual)
        .map(mod => ({
            label: `New ${mod.label} scope`,
            action: () => create_scene_with_viewport(store, {dataType: mod.dataType})
        }));
    contextMenu.value = {
        x: event.clientX, y: event.clientY,
        items: [
            ...scopeItems,
            {separator: true},
            {label: 'Add data source…', action: () => store.commit('ui/open_modal', {name: 'add-source'})}
        ]
    };
}
// }}}
</script>

<style scoped>
.sink-wiring-panel {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--clr-bg-panel);
  color: var(--clr-fg-panel);
  font-size: 9pt;
  overflow: hidden;
}

.sink-wiring-panel :deep(.vue-flow) {
  height: 100%;
}

.sink-wiring-panel :deep(.vue-flow__edge-path) {
  transition: stroke-width 0.1s ease-out;
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
  transition: border-color 0.1s ease-out, box-shadow 0.1s ease-out;
}

.wiring-node--resource {
  border-style: dashed;
}

.wiring-node--hovered {
  border-color: var(--clr-border-active);
  box-shadow: 0 0 0 1px var(--clr-border-active);
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
</style>
