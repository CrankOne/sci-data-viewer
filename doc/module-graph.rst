Block Diagram Module
=====================

A block diagram module (``client/src/modules/graph``, data type ``graph``)
renders node-link diagrams -- finite state machines, DAGs, connectivity
maps, and similar structured graphs -- with a limited, deliberately
graphviz/dot-flavored vocabulary rather than general UML. See also
:doc:`module-3d-viewer`, :doc:`module-plotter`, :doc:`module-table`.

Session/context/module mechanics (what a "board" is, how a viewport is
created, how a module registers itself) are generic and covered by
:doc:`ui-session`; this document only covers what is specific to the
``graph`` data type.

Purpose
-------

The module is read-only with respect to graph structure: it lays out and
renders whatever a data source provides, and lets the user inspect it
(pan/zoom, hover, select nodes and edges). It does not edit or author the
graph.

Its first concrete target is rendering finite state machines: labeled
states as nodes, labeled transitions as directed edges, with a layout
switch between horizontal and vertical structuring -- the same
axis-orientation idea graphviz/dot expose via ``rankdir``.

Data
----

The payload's top-level envelope is ``graphData`` -- this module's own
type-specific envelope, per :doc:`sources`'s convention of one such envelope
per data type (e.g. plot's ``plotData``, :doc:`module-plotter`; geo3d's
``geometryData``, :doc:`module-3d-viewer`):

.. code-block:: js

    {
        "graphData": {
            "layout": {
                "direction": "TB",
                "align": null,
                "ranker": "network-simplex",
                "nodeSep": 50,
                "rankSep": 70,
                "edgeSep": 20
            },
            "nodes": [ ... ],
            "edges": [ ... ]
        }
    }

``layout`` is optional; every field falls back to this module's own
defaults (shown above) when omitted -- see "Layout" below for what each
field means. It is a property of the *payload*, not of the viewport: a
source is free to suggest its own preferred orientation, the same way a
plotter source picks its own transformation domains, while the user can
still override it locally (see "Layout" below).

Nodes
~~~~~

.. code-block:: js

    {
        "_id": "stateIdle",
        "label": "Idle",
        "_facets": {"kind": "state"},
        "shape": "rounded",
        "subjectData": { ... }
    }

``_id``
    Stable identifier, unique within the source's own payload -- the same
    role :doc:`module-3d-viewer`'s ``_name`` plays for geometry items (see
    "Boards" below for how several sources sharing one board avoid
    colliding).
``label``
    Text rendered inside the node. Required in practice: an unlabeled state
    is not a useful FSM node, and dagre needs *some* size to lay a node out
    -- derived from the label's measured extent when ``width``/``height``
    are not given explicitly.
``shape`` (optional, default ``"rect"``)
    One of a small fixed vocabulary: ``rect``, ``rounded``, ``ellipse``,
    ``diamond``, plus five UML pseudostate shapes -- ``circle-filled``,
    ``circle-ringed``, ``bar``, ``terminate`` (see below). Deliberately not
    an open-ended shape system -- this mirrors :doc:`module-plotter`'s own
    closed marker-shape vocabulary rather than graphviz's much larger
    ``shape`` set.
``width`` / ``height`` (optional)
    Explicit size hint in px. When omitted: for the four original shapes,
    measured from the rendered label plus fixed padding; for the five
    pseudostate shapes below, a small fixed size (they carry no meaningful
    label to measure) -- see "Pseudostate shapes".
``_facets`` (optional)
    Free-form ``{name: value}`` metadata, the same convention
    :doc:`module-3d-viewer` and :doc:`module-plotter` already use for
    grouping/filtering. The client always adds one facet of its own on top
    -- ``dataSource``, the owning resource's own name (``store/facets.js``)
    -- so a node/edge is never entirely unfaceted even when a source
    declares none of its own. Clusters are excluded from this (see
    "Clusters" below -- no selection, no hover, nothing to facet yet).
``subjectData`` (optional)
    Opaque payload the client passes through without interpreting -- see
    "Subject data" below.

``label`` is a plain string in v1, but ``DiagramNode.vue`` (see "Component
structure" below) renders it through its own dedicated content slot rather
than inlining a bare ``<text>`` wherever a node is drawn -- so a future
multi-part shape (a UML class compartment: name/attributes/methods, see
"Future scope") is additive there, not a rework of node positioning or
sizing, both of which already only care about the label's own measured
extent, however it ends up structured.

Pseudostate shapes
~~~~~~~~~~~~~~~~~~

Four additional ``shape`` values, each a UML pseudostate rather than an
ordinary named state -- fixed-size (never label-measured, "Nodes" above)
and rendered without a text label even when one is present in the payload
(``DiagramNode.vue`` suppresses it for these four; the label field is still
useful data for hover/selection/sink-forwarding, just not drawn on canvas):

``circle-filled``
    UML's initial pseudostate -- a small filled circle. A source emits one
    per graph as its synthetic entry point.
``circle-ringed``
    UML's final pseudostate -- a ringed circle with a smaller filled dot
    inside. A source emits one per accepted outcome its graph reaches.
``bar``
    UML's fork/join pseudostate -- a thin filled bar, direction-aware (wide
    and short for ``TB``/``BT`` layouts, narrow and tall for ``LR``/``RL``):
    one node with several outgoing edges is a fork, one with several
    incoming edges is a join. Ordinary graph topology to dagre (a fork is
    just a high-fan-out node); ``bar`` only changes how it's drawn.
``terminate``
    UML's terminate pseudostate -- a circle with a diagonal cross. Marks a
    dead end distinct from an ordinary unfinished state: a leaf state that
    was reached but isn't the outcome a competing/fallback procedure
    actually accepted (see "Clusters" below for the concurrent-region case
    this was introduced for).

These four are ordinary nodes in every other respect -- ``_facets``,
``subjectData``, selection/hover, sink forwarding (below) all apply
unchanged; only sizing and label rendering differ.

Edges
~~~~~

.. code-block:: js

    {
        "_id": "t-idle-running",
        "from": "stateIdle",
        "to": "stateRunning",
        "label": "start",
        "_facets": {"kind": "transition"},
        "subjectData": { ... }
    }

``_id``
    Stable identifier, unique within the source's own payload, same role as
    a node's ``_id``. Required even though dagre itself would accept an
    unnamed ``{v, w}`` pair -- this module's own selection/hover/dispatch
    machinery (see "Selection and forwarding" below) needs a stable handle
    on an edge exactly as it does on a node.
``from`` / ``to``
    A node ``_id`` from the *same* payload. An edge referencing a node
    outside its own source's node set is invalid -- this module does not
    support cross-source edges (see "Boards" below).
``label`` (optional)
    Text rendered along the edge, e.g. a transition's triggering event.
``directed`` (optional, default ``true``)
    Whether an arrowhead is drawn at ``to``. This is a *rendering* flag
    only -- dagre has no notion of an undirected edge suitable for layout
    (its ranking algorithm needs a direction to rank on regardless), so an
    edge is always laid out as if directed; ``directed: false`` only
    suppresses the arrowhead at draw time (see "Rendering" below). This is
    deliberately supported from the start, not deferred (see "Future
    scope" below), since it costs nothing beyond the one rendering
    conditional.
``fromPort`` / ``toPort`` (reserved, not yet consumed)
    Placeholders for future port-based attachment (a fixed point on a
    node's boundary rather than wherever dagre's routing happens to touch
    it, see "Future scope" below). Present in the shape now so a future
    source can start emitting them without a breaking payload change; no
    current rendering code reads them.
``_facets`` / ``subjectData`` (optional)
    Same meaning as on a node.

Subject data
~~~~~~~~~~~~

Any data associated with a node or edge: an application-defined payload the
client passes through without interpreting, exactly as :doc:`module-plotter`
already defines it for its own primitives. This is the vehicle for "forward
data associated with [nodes and edges] to the plotter" -- see "Selection and
forwarding" below for how it actually travels there.

Two named sub-aspects are recognized as sink-forwardable today (``modules/
graph/index.js``'s ``resolve_selected_item``, doc/ui-session.rst's
"Selection sinks"): a node's own ``subjectData.plot`` (na64umff's fitted-state
curves, :doc:`module-plotter`) and an edge's own ``subjectData.journal``
(na64umff's per-transition log tree, :doc:`module-journal`) -- ``{"log":
[{"level": "debug" | "error", "message": "..."}, ...], "children":
{"<nested procedure name>": <same shape>, ...}}``, ``log``/``level``/
``message`` verbatim from the C++ fitter's own results logger, nested
procedures kept as their own named subtree rather than flattened in.
Assumed mutually exclusive by item kind (a node forwards ``plot``, an edge forwards
``journal``, never both) -- everything else under ``subjectData`` (e.g. a
node's own ``createdByTransition``/``parameters``) stays opaque, never
matched against a sink-item type.

Nested graphs
~~~~~~~~~~~~~

.. code-block:: js

    {
        "graphData": {
            "nodes": [ ... ],
            "edges": [ ... ],
            "nestedGraphs": [
                {"itemId": "12560-1.100.ECAL0-2-3.json::byDomainBreakdown%3AFitProc", "path": "...", "label": "byDomainBreakdown:FitProc"}
            ]
        }
    }

Optional, top-level (sibling of ``nodes``/``edges``, *not* inside
``subjectData``): a list of other addressable items of the *same* resource
(:doc:`sources`) that render a structurally-nested sub-graph this graph's own
``nodes``/``edges`` omit -- typically because inlining it would produce an
oversized or confusing diagram. na64umff's own per-domain breakdown sub-fits
were the original motivating case, and are now inlined directly instead (see
"Clusters" below) -- ``nestedGraphs`` remains a source's general escape
hatch for detail that genuinely doesn't belong on the main canvas even after
that, not specific to breakdowns.

Unlike ``subjectData``, this field *is* interpreted generically by the
client: any ``graph``-typed source may set it, and the viewport offers every
entry as a "drill into this" affordance (``NestedGraphsPanel.vue``) without
any per-source client code -- selecting one re-fetches that resource at
``itemId`` (``GET {data-url}/{itemId}``, exactly the addressable-item
retrieval :doc:`sources` already defines) and replaces this resource's own
contribution to the board, with a "back" control returning to the item that
was loaded before drilling in.

``itemId``
    An opaque addressable item id for this same resource -- resolved and
    fetched exactly like any other addressable item (:doc:`sources`), never
    interpreted or parsed by the client.
``path`` (optional)
    Human-readable description of where this nested graph sits (e.g. the
    procedure-nesting chain that led to it). Shown as a tooltip; not
    otherwise interpreted.
``label``
    Short text for the drill-down control itself.

A source is expected to advertise ``nestedGraphs`` only on an item that is
*not itself* a drill-down target -- i.e. exactly one level of nesting is
supported; a drilled-into item's own response should omit the field (or
leave it empty) rather than advertise further descendants. This keeps "back"
a single, unambiguous step rather than a full navigation stack; a future
revision that needs deeper nesting would need to extend both this contract
and the client's drill history accordingly.

Clusters
~~~~~~~~

.. code-block:: js

    {
        "graphData": {
            "nodes": [
                {"_id": "s205", "cluster": "domain0", "shape": "terminate", ...}
            ],
            "edges": [ ... ],
            "clusters": [
                {"_id": "domain0", "label": "Domain 0"}
            ]
        }
    }

Optional, top-level (sibling of ``nodes``/``edges``): a list of named
regions a node may declare membership in via its own optional ``cluster``
field (a cluster ``_id``, unset by default -- most nodes belong to no
cluster). A cluster renders as a labeled bordered region drawn behind its
member nodes, sized and positioned by dagre's own compound-graph support
(``dagre.graphlib.Graph({compound: true})``, ``setParent`` -- a real
capability of ``@dagrejs/dagre``, not a client-side approximation: it
produces a correct bounding box around a cluster's children and keeps
several clusters from overlapping, exactly the concurrent-region grouping a
UML fork/join needs).

``_id``
    Stable identifier, unique within the source's own payload, same role as
    a node's or edge's ``_id``.
``label``
    Text rendered at the region's border (typically top-left), identifying
    the concurrent branch it represents (e.g. "Domain 0").

This is na64umff's own motivating case: a ``BreakdownFitProcedure``
genuinely forks into per-domain regions and joins after (see "Pseudostate
shapes" above for the ``bar`` fork/join nodes this pairs with) -- one
cluster per domain, each holding that domain's own competing sub-fit,
inlined directly into the main graph rather than hidden behind
``nestedGraphs``. Clusters are non-interactive this pass: no selection, no
hover, no sink forwarding -- purely a layout/rendering grouping. A node
inside a cluster still selects/hovers/forwards exactly like any other node;
only the cluster's own bounding rect is inert.

Layout
------

Layout is computed by dagre (see "Implementation" below), not stored or
requested from the server beyond the payload's own ``layout`` hint: given
the current ``nodes``/``edges`` and the current *effective* layout options
(payload defaults, overridden by whatever the user has changed locally --
see "Diagrams" below), the viewport recomputes node positions and edge
routing points on every relevant change. For an FSM-sized graph (tens, not
thousands, of states -- a hard limit this module works within, see
"Rendering") this is cheap enough to redo wholesale rather than
incrementally maintained.

``direction`` (dagre's ``rankdir``)
    One of ``"TB"`` (top-to-bottom, default), ``"BT"``, ``"LR"``, ``"RL"``.
    This is the "horizontal/vertical structuring" switch called out in the
    module's goals -- exposed as a toolbar toggle in the viewport
    (analogous to :doc:`module-plotter`'s axis-scale menu being a
    plot-local UI element), not only settable from source data.
``align`` (dagre's ``align``)
    ``null`` (default, centers each rank) or one of ``"UL"``/``"UR"``/
    ``"DL"``/``"DR"`` -- graphviz/dot's own "aligning levels" idea.
``ranker``
    One of ``"network-simplex"`` (default), ``"tight-tree"``,
    ``"longest-path"`` -- dagre's own ranking algorithm choice, exposed
    as-is rather than reinterpreted.
``nodeSep`` / ``rankSep`` / ``edgeSep``
    Spacing in px between nodes in the same rank, between ranks, and
    between adjacent edges, passed straight through to dagre.

A user-driven override of any of these is *diagram* state (see "Diagrams"
below), never written back into the source's own payload -- the same
payload-defaults-vs-local-override split :doc:`module-plotter`'s styling
section describes for its own facet-based style rules.

Boards
------

One **board** is this module's own contextual scope -- a ``graph`` context
in :doc:`ui-session` terms: one merged node/edge store, one hover/selection
state. The source/scope/view relation for this module is
``source -> board -> diagram`` (view), this module's own instantiation of
the generic source/context/viewport-instance pattern every contextual
module follows (:doc:`ui-session`'s "Extension points") -- "board" and
"diagram" are simply this module's own vocabulary for its context and its
viewport, the same way :doc:`module-plotter` picked "desk"/"plot" and
:doc:`module-3d-viewer` picked "scene"/"viewport" for themselves (that
document's "Desks" section explains why each module names these
independently rather than sharing terms). Layout, notably, is *not* part of
a board's own state -- see "Diagrams" below for why it instead belongs to
the viewport.

Several data sources may attach to the same board simultaneously. Unlike
:doc:`module-3d-viewer`'s scene (independent items, no cross-references)
or :doc:`module-plotter`'s desk (independent primitives), this module's
edges *reference* node ids -- so merging more than one source's nodes/edges
into one dagre graph needs every id namespaced by its contributing resource
first (``<resourceName>::<localId>``, internal to the board, never exposed
in source payloads), mirroring :doc:`module-3d-viewer`'s ``geoID@srcID``
composite-id convention. An edge's ``from``/``to`` is resolved against its
*own* resource's node set before namespacing, consistent with "cross-source
edges are invalid" above.

A board does not need incremental per-item update tracking beyond what
namespaced replacement already gives it: like :doc:`module-plotter`'s desk,
a resource's nodes/edges are replaced wholesale on every payload update,
keyed by resource name -- merged into one dagre input via a getter, the
same shape as ``plotDesk.js``'s ``allPrimitives``. Both this board's own
``dataByResource`` and the plotter's ``primitivesByResource`` are live
getters over :doc:`data-model`'s data-source entity (``connection.js``'s
``resources``), not committed state of their own -- see that doc's
"Resolution is always live, never copied".

Diagrams
--------

Layout (``direction``/``align``/``ranker``/``nodeSep``/``rankSep``/
``edgeSep``, "Layout" above) is a property of one **diagram** -- a viewport
*instance*, not the board/context it renders -- and persists across a
reload. This mirrors :doc:`module-3d-viewer`'s own camera state exactly:
"Camera state is keyed by viewport instance, not context -- several
viewports can look at the same scene from independent angles" (that
document's "Cameras" section) -- here, several diagrams can render the same
board with independent layout options (e.g. one horizontal, one vertical,
side by side).

Concretely, this follows ``modules/three-view/store/cameras.js``'s own
shape closely enough to reuse its pattern rather than invent a second one:
a module-global (not per-context) Vuex module, registered once via this
module's own ``storeModules`` entry (:doc:`ui-session`'s "Extension
points"), keyed internally by widget-instance id
(``store/modules/widgetInstances.js``). It departs from that precedent in
one way: cameras.js additionally supports several *named* presets a
viewport can switch between, because multiple saved camera angles is a
real three-view use case; this module has no equivalent "named layouts to
switch between" need, so each diagram instance owns exactly one layout
options object directly, no preset indirection. A diagram's options are
lazily created on first write (reading an unset instance's options simply
falls back to the built-in defaults merged with its board's current
payload-supplied ``layout`` hint, "Layout" above) rather than requiring an
explicit ``register_viewport`` step threaded through every scene-creation
call site the way cameras.js's own registration is -- a smaller footprint
for the same persisted-per-instance shape. Persistence itself does mirror
cameras.js's ``cameraPresetPersistence.js`` directly: a dedicated
``localStorage`` key registered through the same
``store/persistence.js``\ -backed ``install_persistence`` helper, installed
via this module's own ``installPersistence`` hook.

Selection and forwarding
-------------------------

Both nodes and edges are ordinary Vue components bound to this context's
store (:doc:`ui-session`'s "Selection model") -- hover and selection state
live in the generic ``selection`` context module registered under
``contextStoreModules.selection``, the same fixed key
:doc:`module-3d-viewer` and :doc:`module-table` already register, so this
board gets facet-preset/selection-set persistence for free with no
graph-specific code. A node's composite id is namespaced ``node:<id>``
within its board-internal ``<resourceName>::<localId>`` (see "Boards"
above); an edge's is ``edge:<id>`` the same way -- one shared id namespace,
disambiguated by prefix, since :doc:`ui-session`'s selection container has
no notion of "kind of item" beyond the id string itself.

Because the id is just a Vuex-tracked string, a node or edge lighting up on
hover/selection, or losing/gaining its highlight when another view changes
the same board's selection, is ordinary Vue reactivity -- no manual DOM
patching (contrast :doc:`module-3d-viewer`'s hand-rolled WebGL silhouette
pass, which exists only because three.js has no reactive DOM to lean on).
This is also what makes "forward data associated with them to the plotter"
concrete: forwarding a node or edge's ``subjectData.plot`` downstream
reuses :doc:`ui-session`'s existing "Selection sinks" mechanism exactly as
geo3d already does (``buildSinkSnapshot`` building a snapshot -- id,
source, and current ``subjectData.plot`` -- for whichever sink link
``components/SinkWiringPanel.vue``'s "Connect output" created), making
this module a second sink *origin* alongside geo3d. Each selected node/edge is tagged by whichever named
sub-aspect of its own ``subjectData`` matches a known sink-item type --
today just ``plot`` (a node embedding a fitted state's parameters, e.g.
na64utils-msadc's viewer plugin, shaped ``{primitives: [...]}`` like this
module's own plotData envelope) -- rather than by its structural kind or
by ``graph``'s own ``dataType`` -- :doc:`module-plotter` receives it
exactly like directly-loaded plot data, with no graph-specific code on
that side at all. ``subjectData`` is otherwise a grab-bag (parameters,
provenance, ...), not itself the forwarded payload -- only its recognized
sub-aspects are. An item with no ``subjectData.plot`` simply forwards
nothing.

This module is also a sink *target*, the same as any other contextual
module that wants to be one -- there is nothing graph-specific about
receiving: a board registers the shared ``sinkInbox`` factory
(``store/sinkInbox.js``) under ``contextStoreModules.sinkInbox``, declares
``receiveSinkMutation``/``removeIncomingOrigin`` (:doc:`ui-session`'s
"Extension points"), exactly as :doc:`module-table` already does for its
own "Selection view" use case. Routed-in items land in a dedicated side
panel section listing them by origin context, the same shape
:doc:`module-table`'s real consumer renders (one entry per origin, each
holding whatever ``{itemId, srcID, snapshot}`` items that origin's own
sink-dispatch snapshot builder produced) -- deliberately *not* merged into
the board's own node/edge set or drawn into the diagram itself: an incoming
snapshot's shape is whatever the *origin* module's own type looks like
(geo3d geometry, a table row projection, ...), not a graph node, so there
is no general way to place it on this module's own canvas. Whether a future
refinement could recognize an incoming item that happens to reference one
of this board's own node/edge ids (e.g. to highlight it) is left as a
possible follow-up, not designed here.

Rendering
---------

The diagram is drawn as inline SVG, one Vue component per node and per
edge, positioned by dagre's computed coordinates -- not Canvas2D (contrast
:doc:`module-plotter`, whose Canvas2D choice is specifically about drawing
populations too large for one DOM node each). This is a **permanent**
design constraint, not merely today's choice: this module does not, and
will not, support graphs of thousands of nodes/edges -- unlike
:doc:`module-plotter`'s primitives or :doc:`module-3d-viewer`'s point
clouds, a block diagram's whole *point* is that a human reads every node
and edge individually, so the population sizes that would ever force a
Canvas2D/WebGL rendering backend are outside what this module is for in
the first place. One DOM node per node/edge is therefore not a scalability
gap to close later; it is the deliberate ceiling this module is designed
against, and SVG elements getting hover/selection styling and label text
for free from ordinary Vue/CSS (rather than a hand-rolled hit-testing and
text-layout pass) is exactly the trade that ceiling buys.

* A node is a ``<g>`` containing its shape (``<rect>``/``<ellipse>``/
  ``<polygon>`` per "shape" above) and a centered ``<text>`` label,
  positioned via ``transform="translate(x, y)"`` from dagre's node
  coordinates.
* An edge is a ``<path>`` built from dagre's computed routing points
  (a polyline through its assigned "points", not just a straight line
  between two node centers -- what lets edges avoid crossing through
  unrelated nodes and produces the layered look expected of a dot-style
  diagram), with a shared arrowhead ``<marker>`` (applied via
  ``marker-end``, omitted when ``directed: false``, "Edges" above) and an
  optional label positioned at the path's midpoint.
* The whole node/edge set sits inside one ``<g>`` carrying a hand-rolled 2D
  affine transform (translate + uniform scale) for pan/zoom -- deliberately
  not ``d3-zoom``: a 2D pan/zoom over one SVG group is a few lines, and
  pulling in a new dependency for it would cut against this module's own
  minimal-footprint goal (see "Implementation" below). Unlike
  :doc:`module-plotter`'s per-axis affine transform (``zoom.js``, composed
  onto a D3 scale's range because each axis can independently be linear or
  logarithmic), this module has no per-axis scale to compose onto -- both
  dimensions here are always screen-pixel space, so the transform is
  simpler, not merely smaller.

Implementation
---------------

Layout is computed by `@dagrejs/dagre <https://github.com/dagrejs/dagre>`_
-- the maintained successor to the original ``dagre`` package, pure JS
graph-layout only, no rendering, no DOM, no D3 dependency of its own. The
module builds a ``dagre.graphlib.Graph``, calls ``dagre.layout(g)``, and
reads back per-node ``{x, y, width, height}`` and per-edge ``{points}`` --
"Rendering" above does everything downstream of that with plain Vue/SVG.

Deliberately **not** ``dagre-d3``, despite that being the pairing this
module's goals were initially framed around: ``dagre-d3`` bundles an old,
pinned D3 (v5, this project already uses ``d3-scale`` v4 standalone rather
than full D3) and works by directly mutating a D3-selected SVG subtree it
expects to own outright -- the opposite of what "the nodes and edges must
be reactive" (this document's own goal, "Selection and forwarding" above)
needs. Handing dagre only the layout problem and keeping rendering as
ordinary Vue components is both the smaller dependency footprint (one
layout-only package instead of a rendering framework plus an old D3) and
the only way node/edge DOM stays inside Vue's own reactivity rather than a
second, competing DOM owner.

Component structure
--------------------

A likely initial Vue structure, following :doc:`module-plotter`'s and
:doc:`module-table`'s own layout::

    graph/
    ├── index.js              module registration (:doc:`ui-session`)
    ├── DiagramViewport.vue   viewportComponent -- SVG root, pan/zoom, toolbar
    ├── DiagramNode.vue       one node's <g>
    ├── DiagramEdge.vue       one edge's <path> + label
    ├── GraphSinkPanel.vue    sidePanelSections -- routed-in sink items, by origin
    ├── layout.js             dagre.graphlib.Graph construction + dagre.layout() call
    ├── transform.js          hand-rolled 2D pan/zoom affine (see "Rendering")
    └── store/
          graphBoard.js             nodes/edges keyed by resource, live over connection.js
          graphLayout.js            per-diagram-instance layout options (see "Diagrams")
          graphLayoutPersistence.js installPersistence hook for the above

No module-local ``selection.js`` -- selection lives in the shared
``store/selection.js`` (see "Selection and forwarding" above), registered
alongside ``graphBoard``/``sinkInbox`` in ``index.js``'s
``contextStoreModules``, the same pattern :doc:`module-table` already
follows; ``graphLayout`` is registered separately, under ``index.js``'s
``storeModules`` (module-global, not per-context -- see "Diagrams" above),
mirroring how three-view registers its own ``cameras``.

The exact decomposition is implementation-specific.

Showroom demo plugin
----------------------

Following ``demo_plugin``'s existing pattern (one showroom source per
module -- ``demo.showroom`` for geo3d, ``demo.plot-showroom`` for the
plotter, ``demo.table-showroom`` for the table, all in
``demo_plugin/src/demo.py``), a ``demo.graph-showroom`` source should serve
a small, self-contained FSM fixture: a handful of states (e.g. ``Idle``,
``Running``, ``Paused``, ``Stopped``, ``Error``) and labeled transitions
between them, including at least one back-edge (e.g. ``Paused`` ->
``Running`` on ``"resume"``) so the demo exercises dagre's cycle-breaking,
not just a tree. Each node/edge should carry a small illustrative
``subjectData`` (e.g. a duration histogram or a few timestamped samples)
purely so "Selection and forwarding" has something concrete to snapshot and
dispatch, even while the plotter side of that dispatch remains a stub. A
plain source is enough (neither sequential nor addressable, mirroring
``plot_source_descriptor()``/``table_source_descriptor()``) -- there is no
present need for a sequential or addressable graph showroom.

Non-goals
---------

Permanent
~~~~~~~~~

The following are not merely deferred -- this module is designed *against*
ever needing them, and later design decisions should keep constraining
around them rather than leaving room to add them:

* graph editing (moving nodes by hand, adding/removing nodes or edges from
  the UI) -- this module stays read-only with respect to structure, same as
  every other viewer module (:doc:`module-3d-viewer`, :doc:`module-plotter`,
  :doc:`module-table` are each read-only with respect to their own data);
* automatic re-layout animation/transition between layout changes -- a
  layout change (direction toggle, a payload update) simply recomputes and
  redraws;
* server-side layout -- dagre always runs client-side against whatever
  nodes/edges the payload provides, mirroring every other module's
  client-side rendering split;
* graphs of thousands of nodes/edges, and consequently any non-SVG
  rendering backend -- see "Rendering" above for why this is a designed
  ceiling, not a temporary limitation.

Because editing/animation/server-layout are permanently excluded, this
module's own state never needs an undo/redo model, no optimistic-update
reconciliation against a server, and no interrupted-mid-animation edge
case -- one simplification these constraints buy back.

Future scope, not built now
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The following are out of the *first* implementation, but design decisions
made now should stay compatible with adding them later rather than
foreclosing them -- and in particular should stay aligned with what dagre
itself already offers, rather than with only what this first pass renders:

* **Undirected edges** -- already representable in the data shape today
  (``directed: false``, "Edges" above) and already rendered correctly (no
  arrowhead); what remains open is layout quality for a genuinely
  undirected diagram, since dagre's ranking algorithm always operates as if
  every edge were directed regardless of this flag;
* **Limited additional UML notation** (class/component diagrams --
  compartments, multiplicities) -- the ``shape`` vocabulary ("Nodes" above)
  is a small closed registry today, but architecturally an open one (the
  same dispatch-by-string-key shape :doc:`module-3d-viewer`'s geometry
  registry and :doc:`module-plotter`'s marker-type dispatch already use),
  and a node's label is already rendered through its own content slot
  rather than inlined (see "Nodes" above) -- so a compartment-style shape
  is additive to both, not a rework;
* **Port-based edge attachment** (a fixed point on a node's boundary,
  rather than wherever dagre's own routing happens to touch it) -- the
  ``fromPort``/``toPort`` fields are reserved in the edge shape already
  ("Edges" above); dagre itself has no port concept, so this remains
  purely a rendering-layer detail on this module's own side (where a
  ``<path>``'s endpoint is clipped against the node), never something to
  wait on dagre for;
* **Edge bundling** and other dot/graphviz layout features beyond rank
  direction, alignment, and spacing -- only relevant if/when dagre itself
  grows the corresponding option; not something this module would
  implement independently of dagre's own layout engine.

This module targets graphviz/dot's "limited subset" the original draft
already named -- FSMs, DAGs, connectivity maps -- not general UML; the
items above extend that subset's edges, without adopting UML's full
notation.

Initial implementation scope
------------------------------

The first implementation should provide:

1. ``graphData`` payload consumption (nodes, edges, optional ``layout``
   hint);
2. dagre-computed layout with the direction/align/ranker/spacing options
   above, plus a toolbar toggle for direction at minimum, held as
   per-diagram state persisted across reload ("Diagrams" above);
3. SVG rendering of labeled nodes (closed shape vocabulary) and labeled
   directed/undirected edges with arrowheads, following dagre's routed
   points;
4. hand-rolled 2D pan/zoom;
5. hover/selection via the shared ``selection`` context module, node and
   edge ids namespaced and disambiguated as described in "Boards" and
   "Selection and forwarding";
6. sink *origin* support (``buildSinkSnapshot``) mirroring geo3d's, reached
   via ``SinkWiringPanel.vue``'s "Connect output" rather than a per-module
   button (see "Selection and forwarding");
7. sink *target* support (``sinkInbox``, ``GraphSinkPanel.vue``), same as
   "Selection and forwarding" above describes;
8. the ``demo.graph-showroom`` fixture described above.

Multi-resource board merging (several sources on one board, "Boards"
above) should be supported by the architecture from the beginning, since it
falls out for free from ``dataByResource`` already being a live getter
over every matching resource (:doc:`data-model`), the same way
:doc:`module-plotter`'s desk already does, but is not itself a primary
goal of the first pass.

Open questions
----------------

**Stub.** Left here rather than answered:

* Whether node sizing should ever be more than "measured label plus fixed
  padding plus optional explicit override" -- e.g. a fixed grid size per
  ``shape``, closer to a strict UML look. Not needed for the FSM target
  case, but relevant once "Future scope"'s compartment-style shapes exist.
* Layout quality for a genuinely undirected diagram (dagre's ranking
  algorithm has no undirected mode -- see "Future scope" above) is
  unaddressed; ``directed: false`` today only changes rendering, not
  layout.
* The exact node-boundary clipping contract a future port-based edge
  attachment would need (see "Future scope" above) is not designed --
  only the reserved ``fromPort``/``toPort`` data-shape fields exist so far.
* Whether an incoming sink item that references one of a board's own
  node/edge ids should ever be recognized and highlighted, rather than only
  listed in ``GraphSinkPanel.vue`` (see "Selection and forwarding" above),
  is left open -- not needed for a first, honest "list what arrived"
  consumer.
