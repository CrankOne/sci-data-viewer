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

The accepted payload shape, per item:

.. code-block:: js

    {
        "messages": [
            {"level": "debug", "message": "..."},
            {"level": "error", "message": "..."}
        ]
    }

``level``/``message`` are verbatim from the C++ fitter's own results logger
(``JSONProcedureResultsLogger::add_procedure_log_line``) -- opaque strings,
not interpreted beyond picking a display color per ``level``. A future
producer is free to add fields (e.g. ``time``, once the C++ side logs it);
this module reads only the fields it knows about and ignores the rest, the
same "opaque passthrough" convention every other ``subjectData``/sink
payload in this app follows.

A whole-event journal, independent of any one edge, is conceivable (a
directly-loadable ``journal`` source, addressable the same way
``na64umff.fsm``/``na64umff.plot`` are) but not built -- add one later if
that turns out to be wanted alongside the per-edge view.

Rendering
---------

Each incoming sink item's ``messages`` array is rendered as a flat list of
plain-text lines, one per message, colored by ``level`` (an error-level
message reads visually distinct from a debug-level one) -- no columns,
sorting, filtering, or per-message selection yet.

Planned, not built: ``time`` (once the C++ side logs it) and a proper
three-column (time / severity / message) table, at which point each row is
expected to carry its own ``payload``/``_facets`` the way a graph
node/edge or plotter primitive already does -- i.e. a message becomes a
first-class selectable/forwardable item in its own right, not just a
display string. None of that is designed yet; this module's very small
surface today (one component, no store module of its own beyond the
generic ``sinkInbox``) is deliberate, so growing into that shape later
doesn't require unwinding anything built prematurely.

Implementation status
----------------------

**Built**: ``modules/journal/index.js`` (registration: ``dataType:
'journal'``, ``acceptsPayloadTypes: ['journal']``, the generic
``sinkInbox`` context module, no ``selection`` module yet -- nothing here
is selectable within this module itself today) and
``JournalViewport.vue`` (the plain-text rendering described above). On the
producing side, :doc:`module-graph`'s ``resolve_selected_item`` now
recognizes ``subjectData.journal`` alongside its existing
``subjectData.plot`` case; na64umff.py attaches ``journal`` to an edge's
``subjectData`` when its underlying transition's own ``_log`` (a sibling of
that transition's ``snapshot`` in the raw results dump) is non-empty.

**Not built**: everything under "Planned, not built" above; a directly-
loadable whole-event journal source; sub-item selection/forwarding of
individual messages.

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
