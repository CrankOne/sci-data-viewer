Tabular View Module
====================

A tabular data view module is intended for inspecting structured tabular
resources -- a uniform spreadsheet-like presentation for both small
in-memory tables and potentially large remote datasets. See also
:doc:`module-3d-viewer`, :doc:`module-plotter`, :doc:`module-graph`.

Session/context/module mechanics (what a "scene" is, how a viewport is
created, how a module registers itself) are generic and covered by
:doc:`ui-session`; this document only covers what is specific to the
``table`` data type.

Purpose
-------

The module is read-only. It is intended primarily for inspection, selection,
lightweight navigation, and dispatching derived operations such as plotting,
pivoting, and export.

It is not intended to provide spreadsheet editing, formulas, arbitrary cell
formatting, merged cells, or other office-spreadsheet features.

Main use cases
--------------

The module supports the following workflows.

1. **Dataset browsing**

   A tabular resource can be opened as the primary viewer, attached the same
   way any other contextual module's data source is (:doc:`ui-session`'s
   "Data sources: seeding and restoration", ``AddSourceModal.vue``).

   The user shall be able to:

   * see columns, index (both possibly hierarchical) and rows;
   * see a small table directly (as a whole);
   * inspect a view-bounded portion of a large table;
   * browse a paginated view onto random-access resources;
   * browse forward-only sequential resources with scrolling (no hard limit on
     memory).

   The intended interaction is data exploration and export.

2. **Selection view**

   Objects selected in another viewer module may be represented as rows in a
   table shown in a secondary panel -- this is :doc:`ui-session`'s
   cross-module "Selection sinks" mechanism (a context's ``sinkLinks``,
   manual one-shot ``send_selection_to_sink``), with this module as
   the sink *target*: it registers ``receiveSinkMutation`` the same way
   ``modules/sink-view/``'s dev stub does, but renders the routed-in rows
   through the real ``TableView`` rather than dumping raw JSON. This is the
   "real, styled sink consumer" :doc:`ui-session`'s "Selection sinks"
   section names as the one item that mechanism still has open.

   Such tables are expected to be small.

   The tabular module shall not depend on the selection originating from any
   particular module.

3. **Plot dispatch** (postponed)

   For small tables and random-access resources, the user may eventually
   select a small number of columns and request a plot.

   An earlier attempt wired this through :doc:`ui-session`'s "Selection
   sinks" as a bespoke ``'table-projection'`` payload type, converted to
   primitives on the *receiving* (plotter) side. That's been removed:
   :doc:`ui-session`'s sink mechanism now expects every payload type to be
   self-describing (the type of whatever secondary data an item itself
   carries, see :doc:`module-graph`'s "Subject data" for the pattern this
   module would need to follow) rather than receiver-specific conversion
   logic per producer. What this module's own "column projection" should
   look like under that model -- and whether column selection even is the
   right unit, versus per-row ``subjectData`` -- is genuinely open; this
   document takes no position until that's designed.

4. **Pivoting**

   Small tables and random-access resources may expose pivot operations.

   Pivoting is considered a transformation of the underlying dataset, not a
   rendering operation of the table itself, should be permitted by the data
   source via special query string spec.

   The result of a pivot should therefore be represented as another tabular
   source and rendered by the same Tabular View.

5. **Export**

   Small tables shall be exportable from the UI as CSV.

   Remote sources may additionally expose backend-assisted export where
   appropriate.

Architecture
------------

Like every contextual module, this one's own source/scope/view relation
follows :doc:`ui-session`'s generic pattern -- the same one
:doc:`module-3d-viewer`'s scene/viewport and :doc:`module-plotter`'s
desk/plot are each their own instantiation of. ``dataType: 'table'``,
registered via ``modules/registry.js``, with its own ``contextStoreModules``
entries for whatever presentation state this document describes below.
Several data sources may attach to the same table context simultaneously,
each namespaced by resource name, the same as any other contextual module.

Within that, the module should separate presentation from data acquisition::

    Tabular View Module
    │
    ├── TableView
    │     presentation and interaction
    │
    ├── TableController
    │     logical row window
    │     cache
    │     navigation
    │     loading state
    │     view-related commands
    │
    └── TableDataSource
          schema
          capabilities
          row access
          dataset operations

The Vue view shall not depend directly on REST pagination, cursors, or other
transport details.

Table data source
-----------------

Every tabular source shall expose a common logical interface consisting of:

* a schema;
* column metadata;
* row identity where available;
* supported capabilities;
* one or more row-access mechanisms.

A tabular source's plain/addressable/sequential capabilities are exactly
:doc:`sources`'s -- this module adds no new source-capability vocabulary,
only its own logical row-access layer on top (see "Row access" below).

A source may be:

* local;
* random-access;
* sequential;
* or a combination where supported by the underlying resource.

A local table should be treated as the simplest random-access source rather
than as a separate widget type.

Conceptually:

    .. code-block:: js

    {
        schema,
        capabilities: {
            randomAccess,
            sequential,
            finite,
            sort,
            pivot,
            plot,
            export
        }
    }

The exact interface may be refined independently from the visual component.

Row access
----------

Local sources
~~~~~~~~~~~~~

A local source keeps all rows in client memory.

It may perform inexpensive operations such as export or simple sorting locally.

Random-access sources
~~~~~~~~~~~~~~~~~~~~~

A random-access source shall support fetching an arbitrary logical row interval.

Conceptually:

    .. code-block:: js

    fetch_range(start, count, options)

**Not the same pagination as** :doc:`sources`'s **item enumeration.**
:doc:`sources`'s ``page``/``page-size`` ("Pagination") enumerate which
*addressable items* exist -- one ``GET /resource/{id}`` per item once
picked. ``fetch_range`` here means windowing into the *rows of one
already-loaded table*, which needs efficient scrolling over potentially many
rows without a round-trip per row. This module's random-access adapter
therefore reuses :doc:`sources`'s ``page``/``page-size`` *query-parameter
names*, but against a plain or single addressable item's own data endpoint
(``GET /resource`` or ``GET /resource/{id}``), returning ``{schema, rows,
total}`` rather than ``{items, total}`` -- see :doc:`sources`'s "Row-window
pagination" for the precise addendum this reuses. A thin ``connection.js``
action alongside handles this fetch, distinct from ``list_resource_items``
(whose contract is item-enumeration only).

Pagination used by a backend is an implementation detail of the source adapter.

The Table View operates in terms of logical row positions, not pages.

Sequential sources
~~~~~~~~~~~~~~~~~~

A sequential source shall support forward acquisition:

    .. code-block:: js

    fetch_next(count)

Previously acquired rows may be retained in a local cache and revisited.

The UI shall not imply random access where the source cannot provide it.

For a sequential source, the scrollable region represents the materialised
portion of the sequence; reaching its end may request additional rows.

Schema and columns
------------------

Columns shall be described independently from row data.

The schema shall support hierarchical columns.

For example::

             fitted              truth
         x      y      p      x      y      p

shall be represented as a column tree rather than flattened solely for rendering.

Leaf columns shall have stable identifiers.

The schema may additionally provide:

* display label;
* data type;
* units;
* formatting hints;
* optional semantic metadata.

Formatting hints are advisory and deliberately limited.

Table state
-----------

The Tabular View module owns state related to presentation and interaction,
including where applicable:

* visible columns;
* column order;
* column widths;
* current logical row window;
* selected rows or cells;
* sort specification;
* active source;
* loading/error state.

Dataset transformations themselves shall remain outside the view state.

In particular::

    column visibility     → view state
    column resizing       → view state
    cell selection        → view state

    sorting               → source/controller request
    pivoting              → dataset transformation
    plotting              → dispatch to plot module
    export                 → source capability

Selection
---------

Selection reuses :doc:`ui-session`'s generic ``selection`` context module
(that document's "Selection model") rather than a bespoke model of its own
-- a row is a whole *item* (``selectedItemIDs``, row id = item id); cell
selection is a *sub-item* of its row (``selectedSubItems``, keyed by row id,
with the **column id** -- never a positional index -- as the sub-item
value). This is structurally the same "one item standing in for numerous
individually-selectable sub-elements" shape :doc:`module-3d-viewer` already
uses for point-cloud markers, just with a string sub-item key instead of a
numeric one; :doc:`ui-session`'s "Selection model" and
``store/selectionAlgebra.js`` are field-name-neutral for exactly this
reason.

Column id, not position, is required: column visibility and column order
are independent view state (see "Table state" above) that must not silently
invalidate a live cell selection if a column is hidden or reordered.

Reusing the shared module gets this table context facet-preset/
selection-set persistence for free (``contexts.js``'s
``install_selection_persistence``, gated generically on any module
registering a ``selection`` context entry, not on this module's identity).

Row identity: where possible, rows shall be identified by stable opaque row
IDs, supplied by the source -- never derived from array position, which
shifts under sorting/windowing.

Range selections shall remain valid independently of DOM virtualisation.

The selection model shall not depend on which rows are currently rendered.

Sorting
-------

Sorting is an optional source capability.

For local tables, sorting may be performed locally.

For remote or large resources, sorting should normally be delegated to the
backend.

The table shall represent sorting as a specification, for example:

    .. code-block:: js

    [
        { column: "chi2", direction: "asc" }
    ]

Applying a new sort order invalidates the current logical row ordering and the
corresponding row cache.

Sorting shall not be assumed available for sequential-only sources.

Pivoting
--------

Pivoting shall not be implemented inside the table renderer.

A pivot operation shall produce a new tabular source::

    source
      │
      └── pivot(specification)
              │
              ▼
         derived source
              │
              ▼
          TableView


This keeps local and backend pivot implementations interchangeable.

A sub-optimal local implementation is acceptable for small tables.

Plot integration
----------------

The Tabular View may allow the user to select a limited number of compatible
columns and request a plot.

The resulting plot is owned and rendered by the plotting module.

The table may dispatch either:

* the selected local values; or
* a projection/aggregation request against the source.

Plotting is considered an auxiliary reconnaissance workflow, not part of the
core table renderer. See "Plot dispatch" above for this dispatch's current
one-way-stub status.

Export
------

Export is an optional source capability.

For local tables, CSV should be supported directly in the client.

Remote sources may expose backend-assisted export.

The same UI action may therefore resolve to different implementations through
the source abstraction.

Export of arbitrary large datasets is not required to be performed by the
browser.

A Blob-download-and-click affordance already exists once, inline, in
``SessionPickerModal.vue``'s ``export_to_file`` (JSON session export) --
worth extracting into a small reusable helper for this module's CSV export
to use, rather than a second inline copy.

Rendering
---------

The visual component shall provide:

* hierarchical headers;
* sticky or otherwise persistent column headers;
* efficient row scrolling;
* cell and row selection;
* optional column resizing;
* column visibility control;
* lightweight sorting controls;
* source-capability-dependent actions.

The appearance should be that of a compact scientific data browser rather than
a general-purpose spreadsheet.

TanStack usage
--------------

The initial implementation should use **TanStack Virtual** for row
virtualisation -- worth the dependency (none of this app's other hand-rolled
views, e.g. :doc:`module-3d-viewer`'s Items tree or :doc:`module-plotter`'s
canvas drawing, need it, but virtualisation correctness under dynamic row
heights and scroll-anchoring is a solved problem not worth re-solving).

TanStack Virtual is responsible only for determining which logical rows need to
be represented in the DOM.

**TanStack Table** may be used as the headless table model for:

* hierarchical header construction;
* row/cell/header models;
* column visibility and sizing;
* selection bookkeeping;
* sorting state;
* column ordering.

TanStack Table shall not own backend data acquisition or dataset transformations.

Its use should remain replaceable. The module's public abstractions shall
therefore be defined in terms of the Tabular View's own schema, controller,
and source interfaces rather than exposing TanStack objects to the rest of the
application.

The initial implementation should start without it: sorting is
server-driven (less state for a headless table model to own) and the
"no TanStack objects leak past this module's own interfaces" constraint
above means a small custom column-tree model is already required regardless
of whether TanStack Table sits behind it. Add it later only if the custom
model's own bookkeeping (visibility/sizing/ordering) grows enough to
duplicate what TanStack Table would already give for free -- see "Open
questions".

Component structure
-------------------

A likely initial Vue structure, following :doc:`module-plotter`'s and
:doc:`module-3d-viewer`'s own layout::

    table/
    ├── index.js              module registration (:doc:`ui-session`)
    ├── TableViewport.vue     viewportComponent
    ├── TableHeader.vue
    ├── TableBody.vue
    ├── TableToolbar.vue
    ├── controller.js
    ├── schema.js
    ├── store/
    │     tableDesk.js        directly-loaded rows, keyed by resource,
    │                         live over connection.js (mirroring
    │                         ``modules/plotter/store/plotDesk.js``)
    └── sources/
          local.js
          random-access.js
          sequential.js

No module-local ``selection.js`` -- selection lives in the shared
``store/selection.js`` (see "Selection" above), registered alongside
``tableDesk`` in ``index.js``'s ``contextStoreModules``.

The exact decomposition is implementation-specific.

Non-goals
---------

The following are explicitly outside the initial scope:

* editing;
* formulas;
* spreadsheet-compatible clipboard semantics;
* rich cell formatting;
* merged cells;
* interactive local aggregation;
* Excel-like filtering;
* arbitrary cell widgets;
* spreadsheet document import/export;
* full-featured pivot-table UI.

These may be reconsidered only if concrete workflows require them.

Initial implementation scope
----------------------------

The first implementation should provide:

1. local and random-access data sources;
2. hierarchical columns;
3. row virtualisation;
4. column visibility and resizing;
5. row/cell selection;
6. server-driven sorting;
7. CSV export for local tables;
8. a minimal hook for dispatching selected columns to the plotting module
   (see "Plot dispatch" above -- a UI-level stub, not a working round trip,
   until :doc:`module-plotter` has something to receive it).

Sequential browsing and pivot-source creation should be supported by the
architecture from the beginning, but may follow in subsequent implementation
stages.

Implementation status
----------------------

**Built** (``modules/table/``): local and random-access sources
(``sources/local.js``/``sources/randomAccess.js``, the latter exercising
:doc:`sources`'s "Row-window pagination" against
``demo.table-random-access-showroom``), ``controller.js``'s row window/
cache/loading/error state, TanStack Virtual-driven row rendering with
scroll-triggered prefetch, hierarchical column headers and column
visibility/resizing (``schema.js``), and row/cell selection via the shared
``selection`` context module exactly as decided above -- including its
facet-preset/selection-set persistence, which needed no table-specific
code to work. The module is also a real sink *target* (``sinkInbox``,
shared with ``modules/sink-view/``'s stub), fulfilling the "Selection view"
use case.

Server-driven sorting (both source kinds -- client-side for `local`,
``sort-column``/``sort-direction`` row-window query params for
`random-access`, a convention local to this adapter and its demo backend,
not part of :doc:`sources`'s own row-window spec) and CSV export for local
tables (``export.js``, using a Blob-download helper -- ``client/src/
download.js`` -- extracted from ``SessionPickerModal.vue``'s prior inline
copy so both have one place to share it) are built.

A first plot-dispatch hook was built and then removed: it forwarded a
column projection as a bespoke ``'table-projection'`` payload type,
converted to primitives by the *plotter*, which turned out to be exactly
the receiver-side-conversion shape :doc:`ui-session`'s "Selection sinks"
mechanism no longer wants (see "Plot dispatch" above). Removed along with
it: ``send_table_projection_to_sink()`` (``store/sinkDispatch.js``) and
``ConnectScopeModal.vue``'s ``dispatchFn`` escape hatch it was the only
caller of.

**Not built yet**: sequential sources (``sources/sequential.js`` is shape
-only, per "Row access" above), pivot-source creation, backend-assisted
export, and plot dispatch (postponed, see "Plot dispatch" above).

Open questions
---------------

**Stub.** Left here rather than answered:

* Whether TanStack Table ever gets adopted, or the module's own custom
  column-tree model (see "TanStack usage") turns out sufficient
  indefinitely -- built and proven against real hierarchical demo data
  (``demo.table-showroom``'s "Fitted"/"Truth" grouping) without it so far,
  but still deliberately not a final decision.
* The random-access row-window wire convention (see "Row access" above,
  :doc:`sources`'s "Row-window pagination") now has one working
  client+server round trip (``connection.js``'s ``fetch_row_window``,
  ``demo.table-random-access-showroom``) proving the shape holds up end to
  end -- but still only the one backend; a second, independent
  implementation would be a stronger test of the convention than this
  module's own demo source can be alone.
* Backend-assisted export's exact contract (a capability flag exists in
  "Table data source" above, but no endpoint shape is specified) is
  unaddressed until a concrete remote source needs it.
* Pivot-source creation's query-string spec (see "Pivoting") is named but
  not designed.
* The column-visibility toggle lists a leaf column by its own label only
  (``TableViewport.vue``), which is ambiguous for same-named leaves under
  different groups (e.g. this module's own "Fitted x" vs. "Truth x" both
  show as plain "x") -- a real "picker" UI, if one gets built, should
  disambiguate by group path; the current toggle is intentionally minimal.
