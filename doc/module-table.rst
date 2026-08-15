Tabular View Module
===================

A tabular data view module is intended for inspecting structured
tabular resources. It provides a uniform spreadsheet-like presentation for both
small in-memory tables and potentially large remote datasets.

Purpose
-------

The module is read-only. It is intended primarily for inspection, selection,
lightweight navigation, and dispatching derived operations such as plotting,
pivoting, and export.

It is not intended to provide spreadsheet editing, formulas, arbitrary cell
formatting, merged cells, or other office-spreadsheet features.

The module shall integrate with the viewer's modular architecture in the same
manner as the 3D viewer and function plotter, maintaining its own state and
component hierarchy.

Main use cases
--------------

The module shall support the following workflows.

1. **Dataset browsing**

   A tabular resource can be opened as the primary viewer.

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
   table shown in a secondary panel.

   Such tables are expected to be small.

   The tabular module shall not depend on the selection originating from any
   particular module.

3. **Plot dispatch**

   For small tables and random-access resources, the user may select a small
   number of columns and request a plot.

   Plot rendering belongs to the plotting module. The tabular module only
   selects the relevant columns and dispatches the corresponding data request
   or projection.

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

The module should separate presentation from data acquisition::

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

Selection shall use logical data coordinates rather than DOM elements.

Where possible, rows shall be identified by stable opaque row IDs.

Cell selection should use row identity and column identity:

    .. code-block:: js

    {
        rowId,
        columnId
    }

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
core table renderer.

Export
------

Export is an optional source capability.

For local tables, CSV should be supported directly in the client.

Remote sources may expose backend-assisted export.

The same UI action may therefore resolve to different implementations through
the source abstraction.

Export of arbitrary large datasets is not required to be performed by the
browser.

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
virtualisation.

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

If TanStack Table proves to duplicate rather than simplify the module's own
controller/state logic, the implementation may retain TanStack Virtual while
replacing TanStack Table with a small custom table model.

Component structure
-------------------

A likely initial Vue structure is::

    tabular/
    ├── TabularModule.vue
    ├── TableView.vue
    ├── TableHeader.vue
    ├── TableBody.vue
    ├── TableToolbar.vue
    ├── controller.js
    ├── schema.js
    ├── selection.js
    └── sources/
          local.js
          random-access.js
          sequential.js

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
8. a minimal hook for dispatching selected columns to the plotting module.

Sequential browsing and pivot-source creation should be supported by the
architecture from the beginning, but may follow in subsequent implementation
stages.

