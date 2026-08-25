Client Data Model
===================

.. admonition:: Status

   This document records a conceptual model reached in discussion on
   2026-08-24 while building an interactive wiring-diagram sub-panel
   (``client/src/components/SinkWiringPanel.vue``) over :doc:`ui-session`'s
   "Selection sinks" mechanism. As of 2026-08-24 it is fully implemented --
   see "Status against the current implementation" at the end for exactly
   which piece closed the one gap that existed when this document was
   first written. Where this disagrees with :doc:`ui-session` on wording
   (not behavior), this document is the more current description;
   :doc:`ui-session` is being brought in line with it.

Three entities, not two
------------------------

The client's data-flow model has exactly three kinds of thing in it --
**data source**, **scope**, and **module view** -- each with a distinct job.
A common confusion (including in earlier drafts of this document's own
reasoning) is to conflate the last two, or to assume a scope has two
structurally different kinds of input; neither holds up.

``data source`` (resource)
    One connection to a :doc:`sources`-conformant endpoint
    (``connection.js``'s ``resources`` map). Declares exactly one ``type``.
    A source's own fetched payload is never a monolithic blob: every module
    type's envelope is already **a list of individually-addressable
    items** -- geo3d's ``geoData[srcID].geometry`` (each entry with its own
    ``_name``), the graph module's ``dataByResource[name].{nodes,edges}``
    (each with its own ``_id``), the plotter's ``primitives`` list, a
    table's rows. Every item in one source's list shares that source's one
    declared ``type`` -- a source doesn't mix types internally.

``scope`` (today's ``context``, ``store/modules/contexts.js``)
    An **aggregator**, not a passive store. A scope's content is the union
    of whatever its currently-active *links* currently resolve to -- there
    is no single authoritative source for a scope's data: it may aggregate
    from several data sources and from several other scopes' selections at
    once, simultaneously, with no ordering or precedence between them
    (already true today for the "several sources" case -- see "Status"
    below). A scope owns exactly one thing beyond its aggregated content:
    its own **selection state** (``selection_<ctx>``, doc/ui-session.rst's
    "Selection model") -- the one thing that makes it a scope rather than
    just a cache.

``module view`` (viewport / widget instance, ``store/modules/widgetInstances.js``)
    A pure rendering surface bound to exactly one scope at a time. A view
    owns *only* its own presentation state -- camera position, pan/zoom,
    axis transforms -- never any domain data, and never a "context" of its
    own in the scope sense. Several views may share one scope
    simultaneously (three-view's ``cameras.js`` is the existing precedent:
    several independent cameras over one geometry cache). A view has no
    output port and does not appear in the wiring diagram at all: selecting
    something happens *through* a view (a click, a drag), but the
    selection itself is written straight into the *scope's* shared
    selection state, not held by the view and "propagated" afterward --
    every other view sharing that scope simply reads the same state back,
    which is why they all update together for free, with no explicit
    propagation step to design or get wrong.

One input concept per scope, not two
--------------------------------------

Given the above, a scope's incoming data is uniform in shape: **a stream
of typed item references** -- ``{itemId, srcID, type, payload}`` -- from
however many links are currently active. What varies between a *data
source* link and a *sink* (another-scope-selection) link is not the shape
of what flows through them, but two independent, per-link properties:

``membership rule`` -- which items currently qualify
    A source link's rule is *unconditional by default*: every item the
    source currently holds, for as long as it's attached, optionally
    narrowed by the resource's own ``facetsSelector`` (``connection.js``'s
    ``add_resource`` -- ``null`` means unconditional, the original
    behavior). A sink link's rule is *selection-driven*: only the items
    currently selected in the origin scope, likewise optionally narrowed by
    its own ``facetsSelector`` (doc/ui-session.rst's "Selection sinks").
    ``facetsSelector`` itself is the same mechanism either way -- an AND-
    match against an item's own ``_facets`` (``store/facets.js``'s
    ``matches_facets_selector``) -- what differs between the two link kinds
    is only *what set it narrows*: the source's whole current holding, or
    the origin's current selection.

``refresh trigger`` -- when the qualifying set is re-evaluated
    A source link re-evaluates when the source's own fetched data changes.
    A sink link re-evaluates when the origin scope's selection changes
    (``store/sinkAutoDispatch.js``'s role today).

``type``, by contrast, is not a per-link-kind distinction at all: a source
link's items are uniformly typed by the source's own declared ``type``
purely because a source only ever declares one; a sink link's items are
typed per-item, by whichever secondary facet each selected item happens to
carry (:doc:`module-graph`'s "Subject data" is the concrete case: a node's
``subjectData.plot``, tagged ``'plot'``). Both are instances of the same
rule -- "each item's type is whatever the *item itself* carries" -- a
source's items just all happen to carry the same one, because that's what
a source manifest constrains.

Neither of these per-link properties requires a structurally different
*port* on the scope. A scope has one input; a source link and a sink link
are two kinds of *edge* feeding it, distinguished by their own membership
rule and refresh trigger, the same way a sink link is already
distinguished from another sink link by its own ``facetsSelector``. The
wiring diagram draws one input port per scope -- see "Consequence for the
wiring diagram" below.

Resolution is always live, never copied
------------------------------------------

Both kinds of link resolve their current item list **on demand, from the
origin, every time a consumer needs it** -- never a snapshot copied at
link-creation or link-trigger time. This is already how sink links work,
end to end: ``store/sinkDispatch.js``'s ``deliver_to_sink`` persists only
identity (``{itemId, srcID, payloadType, originRef}``), and ``store/
sinkResolve.js``'s ``resolve_incoming_sink_items`` calls the origin
module's own ``resolveSinkItem`` fresh on every read. A removed origin
scope simply has nothing left to resolve -- there's no separate cleanup
step required for a stale reference to stop displaying.

For this to also be true of a *source* link, a source's fetched data needs
to live with the source itself -- exposed for on-demand, per-item
resolution the same way ``resolveSinkItem`` already exposes a scope's
selection -- rather than being reshaped and pushed as an owned copy into
the scope's own per-dataType Vuex module the moment it's fetched. Built:
``connection.js`` keeps a loaded resource's raw fetched body on the
resource record itself (``resource.data``); each contextual module's own
per-context store (``view3D.js``, ``graphBoard.js``, ``plotDesk.js``,
``tableDesk.js``) exposes its scope's slice of that as a getter, filtered
by this context's id and the module's own ``type``, rather than as
committed state a mutation once pushed into.

Status against the current implementation
--------------------------------------------

**Built, matches this document in full:**

* A scope aggregating several data sources at once (every module's own
  ``dataByResource``/``primitivesByResource``/``geoData`` shape).
* A scope aggregating several other scopes' selections at once (true N:N
  ``sinkLinks``, doc/ui-session.rst's "Selection sinks").
* Sink links resolving live, by reference, never a copied snapshot
  (``store/sinkResolve.js``).
* Selection owned by the scope, shared by every view attached to it, with
  no explicit propagation step (``selection_<ctx>``, several viewport
  instances sharing one ``contextId`` -- ``store/modules/widgetInstances
  .js``'s own header comment).
* A view never appearing in the sink-wiring graph, having no output port
  of its own (confirmed directly against ``SinkWiringPanel.vue``'s node
  model, which only ever draws resources and scopes).
* A data source's fetched payload resolving live from the source itself
  (``resource.data``, ``connection.js``), not pushed as an owned copy into
  any module's own state. Reassigning a source to a different scope is now
  a plain field flip (``connection.js``'s ``reassign_resource_context``) --
  no explicit remove-from-old / refetch-into-new step, since nothing owns
  a copy to invalidate.
* A scope's two intakes sharing one input port and one uniform mechanism
  shape, distinguished only by their own membership rule and refresh
  trigger (this document's "One input concept per scope, not two"), rather
  than being mechanically different pipelines.
* A source link's membership rule symmetric with a sink link's: both
  optionally narrowed by a ``facetsSelector``, the same AND-match predicate
  either way (``store/facets.js``'s ``matches_facets_selector``), editable
  from ``SinkWiringPanel.vue``'s "Assign facet…" context-menu item on
  either edge kind. Every item across geo3d/graph/plot (table excepted) is
  additionally guaranteed at least one facet regardless of what the source
  itself declares -- a client-injected ``dataSource`` facet
  (``with_data_source_facet``), so a resource's own ``facetsSelector`` is
  never filtering against a possibly-empty ``_facets``.

Consequence for the wiring diagram
--------------------------------------

``SinkWiringPanel.vue``'s scope node draws one target handle (``in``) for
both a resource attachment and a sink link, now that both resolve live the
same way and feed the same intake -- resource edges and sink edges are
distinguished only by edge style (dashed vs. solid, matching
``.wiring-node--resource``'s own dashed convention), not by which port
they land on.
