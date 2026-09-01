Journal Module
===============

**Draft.** A minimal viewer module (``client/src/modules/journal``, data type
``journal``) for displaying log/diagnostic messages associated with another
module's data -- today, specifically, a :doc:`module-graph` edge's own
per-transition log lines (na64utils-msadc's ``LogRecord``/
``add_procedure_log_line`` machinery). See also :doc:`module-graph`,
:doc:`module-plotter`.

Session/context/module mechanics are generic and covered by
:doc:`ui-session`; this document only covers what is specific to the
``journal`` data type.

Purpose
-------

A plain, leaf-panel display for a list of text messages -- "nothing
special" by design, for now. Deliberately not a general-purpose log viewer:
it exists to give a block-diagram edge's own fit-procedure log lines
somewhere to land once selected, the same way :doc:`module-plotter` gives a
node's own fitted curves somewhere to land.

Data
----

Unlike :doc:`module-plotter`/:doc:`module-graph`, this module declares no
directly-loadable source of its own yet -- it is a sink *target* only
(:doc:`ui-session`'s "Selection sinks"), receiving whatever a producing
module tags with ``payloadType: 'journal'``. Today that's exactly one
producer: :doc:`module-graph`'s edges, whose own ``subjectData.journal``
(see that document's "Subject data") is forwarded when the edge is
selected.

The accepted payload shape, per item -- a tree, not a flat list, mirroring
the real C++ procedure-call structure one transition's own work is nested
under:

.. code-block:: js

    {
        "log": [
            {"level": "debug", "message": "..."},
            {"level": "error", "message": "..."}
        ],
        "children": {
            "wbTemplatesFindPeaksFallback:FitProc": {
                "log": [ {"level": "debug", "message": "..."} ],
                "children": {}
            }
        }
    }

``log``/``level``/``message`` are verbatim from the C++ fitter's own
results logger (``JSONProcedureResultsLogger::add_procedure_log_line``) --
opaque strings, not interpreted beyond picking a display color per
``level``. ``children`` keys are the names of nested procedures called
*during* this transition's own work (e.g. a pulse-finding fallback, or a
sibling transition attempted-and-failed from the same state) -- each an
identically-shaped subtree, recursively. Deliberately **not** flattened
server-side: an earlier version concatenated every nested procedure's log
into one array, which lost which procedure actually said what and read as
duplication the moment two views might want the same underlying data (e.g.
"just this helper's own output" vs. "everything that happened during this
transition") -- see :doc:`module-graph`'s "Subject data" for the exact
exclusion rules deciding what counts as "nested under this transition" vs.
"its own separate edge". Combining/flattening for display, if wanted, is
the client's job (``JournalTree.vue``), not baked into the payload. A
future producer is free to add fields (e.g. ``time`` per message, once the
C++ side logs it) or richer per-node metadata; this module reads only the
fields it knows about and ignores the rest, the same "opaque passthrough"
convention every other ``subjectData``/sink payload in this app follows.

A whole-event journal, independent of any one edge, is conceivable (a
directly-loadable ``journal`` source, addressable the same way
``na64umff.fsm``/``na64umff.plot`` are) but not built -- add one later if
that turns out to be wanted alongside the per-edge view.

Rendering
---------

Each incoming sink item's tree is rendered recursively (``JournalTree.vue``):
a node's own ``log`` as a flat list of plain-text lines colored by ``level``
(an error-level message reads visually distinct from a debug-level one),
followed by one indented, labeled subtree per ``children`` entry -- the
procedure name as a small heading, then that subtree's own messages, and so
on. No columns, sorting, filtering, collapsing, or per-message selection
yet; this is *a* way to read the tree (nested indentation, traversal
order), not the only possible one.

Planned, not built: ``time`` (once the C++ side logs it) and a proper
three-column (time / severity / message) table, at which point each row is
expected to carry its own ``payload``/``_facets`` the way a graph
node/edge or plotter primitive already does -- i.e. a message becomes a
first-class selectable/forwardable item in its own right, not just a
display string. None of that is designed yet; this module's very small
surface today (two components, no store module of its own beyond the
generic ``sinkInbox``) is deliberate, so growing into that shape later
doesn't require unwinding anything built prematurely.

Implementation status
----------------------

**Built**: ``modules/journal/index.js`` (registration: ``dataType:
'journal'``, ``acceptsPayloadTypes: ['journal']``, the generic
``sinkInbox`` context module, no ``selection`` module yet -- nothing here
is selectable within this module itself today), ``JournalViewport.vue``
(lists incoming sink items, one per origin), and ``JournalTree.vue`` (the
recursive per-item tree rendering described above). On the producing side,
:doc:`module-graph`'s ``resolve_selected_item`` now recognizes
``subjectData.journal`` alongside its existing ``subjectData.plot`` case;
na64umff.py attaches ``journal`` to an edge's ``subjectData`` as a
``{log, children}`` tree (``_collect_transition_log_tree``) built from its
underlying transition's own procedure-call subtree in the raw results
dump, excluding whatever gets its own separate edge elsewhere (a sibling
FSM transition, or a nested breakdown's own in-domain fit) -- omitted
entirely when empty.

**Not built**: everything under "Planned, not built" above; a directly-
loadable whole-event journal source; sub-item selection/forwarding of
individual messages; surfacing a procedure that has *no* push/pop scope of
its own at all today (e.g. pulse-merging's internal decisions) -- that
needs new C++ instrumentation before it can appear here as anything,
tracked separately from this module's own scope.

Open questions
--------------

**Stub.** Left here rather than answered:

* Whether "associated with a graph edge" should stay purely a sink-forward
  relationship (today's shape), or whether messages should also be
  reachable some other way (e.g. listed inline in the diagram itself, or a
  whole-event view independent of edge selection).
* The eventual three-column table's own row-selection/forwarding model --
  likely the same shared ``store/selection.js`` every other module uses,
  once there's a first real per-row payload to forward, but not decided.
* Whether a message ever needs its *own* ``subjectData``/facets distinct
  from the edge it came from (e.g. linking a specific error back to the
  parameter or domain it concerns) -- plausible, given the three-column
  plan already anticipates per-row payload, but nothing concrete yet.
