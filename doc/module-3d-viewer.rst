3D Viewer Module
=================

The 3D viewer (``client/src/modules/three-view``, data type ``geo3d``) renders
static and streamed spatial geometry -- detector layouts, tracks, hits, and
similar scientific 3D content -- using three.js. See also :doc:`module-plotter`,
:doc:`module-table`, :doc:`module-block-diagram`.

Session/context/module mechanics (what a "scene" is, how a viewport is
created, how a module registers itself) are generic and covered by
:doc:`ui-session`; this document only covers what is specific to ``geo3d``.

Purpose
-------

The module is read-only with respect to the geometry itself: it renders
whatever a data source provides and lets the user inspect it (orbit/pan/zoom,
hover, select, group by facet, toggle visibility). It does not edit or
author geometry.

Data
----

A ``geo3d`` payload -- what a data source's ``data-url`` (see :doc:`sources`)
resolves to, or a sequential source's session ``current`` -- has the shape:

.. code-block:: js

    {
        "geometryData": {
            "materials": [ {"_name": ..., "_type": ..., ...}, ... ],
            "geometry":  [ {"_name": ..., "_type": ..., "_material": ..., ...}, ... ]
        }
    }

Every geometry item carries:

``_name``
    Unique key within the source's own payload. Determines identity across
    repeated payloads from the same source (see "Scenes" below) -- an item
    absent from a new payload is dropped, one with the same name and an
    unchanged definition is left alone, anything else is rebuilt.
``_type``
    Dispatch key into the geometry-type registry (below).
``_material``
    Name of an entry in this same payload's ``materials`` array, or one of
    the module's built-in defaults (``defaultMeshMaterial``,
    ``defaultLineMaterial``, ``defaultFatLineMaterial``).
``_transfGroup`` (optional)
    See "Transformation groups".
``_facets`` / ``_classifiers`` (optional)
    Free-form ``{name: value}`` metadata for grouping/filtering in the Items
    panel (below); the two spellings are accepted interchangeably.
``_pickable`` (optional, default ``true``)
    Whether the item participates in raycasting (hover/selection) at all.

Geometry types currently implemented (``client/src/modules/three-view/geometry/``):
``Line``, ``ColoredLineSegments`` (per-vertex-colored, despite the name still
one connected polyline), ``PointMarkers`` (see "Markers"), ``BoxGeometry``,
``Plane``, ``ShapeGeometry`` (2D contour with holes, extruded flat).

Material types (``client/src/modules/three-view/materials/``): ``LineMaterial``,
``MeshMaterial``, ``PointMarkersShaderMaterial``, ``ColoredLineShaderMaterial``.
A source is free to declare the same material under different names across
payloads; unchanged declarations are recognized and left alone rather than
rebuilt (``MaterialManager.sync_source_materials``).

Scenes
------

A *scene* is one ``geo3d`` context (:doc:`ui-session`'s ``view3D_<ctxId>``
Vuex module): one three.js ``Scene``, one geometry store, one set of
transformation groups, one hover/selection/facet state. Several data-source
resources can be attached to the same scene simultaneously -- each source's
items are kept in their own namespace (keyed by resource name), so two
sources can reuse the same ``_name`` without colliding, and removing or
reassigning one source only ever touches its own items.

A resource's items are (re)synced into its scene on every payload update
(``GeometryManager.update_drawables_from_source``): unchanged items are left
in place, changed ones rebuilt, and anything no longer present in the new
payload is removed. This is what makes a *sequential* source practical for
per-event geometry (see :doc:`sources`'s sequential capability) -- each
session advance simply re-runs this sync under the same resource name, so a
new event's items replace the previous event's automatically.

Cameras
-------

Two camera presets, perspective and orthographic (``store/cameras.js``),
each with position/target/up/near/far and a ``picking`` block
(``radiusPx``, and ``maxDistance`` for perspective) controlling how generous
raycasting is in screen pixels. Camera state is keyed by *viewport instance*,
not by context -- several viewports can look at the same scene from
independent angles.

Named camera presets are saved per session (not per scene) via
``cameraPresetPersistence.js``, so switching between saved viewpoints is a
session-wide affordance, and a fresh viewport starts from the module's
built-in defaults rather than an empty state.

When ``highlightAllUnderCursor`` is off, only one under-cursor item is
highlighted at a time; the mouse wheel cycles through the last raycast's
hit stack instead of zooming (``ThreeView.cycle_hover``/``handle_wheel``).

Transformation groups
----------------------

A named group (``store/transfGroups``) applies a shared position/rotation/
scale to every item that opts in via ``_transfGroup``, e.g.:

.. code-block:: js

    "_transfGroup": "main"
    // or, selecting which channels and their composition order:
    "_transfGroup": {"name": "main", "rotation": 0, "scale": null}

Channels compose innermost-first (default order: scale, then rotation, then
position); an item can exclude a channel (``null``) or opt out of the group
affecting its *own* orientation/size while still following its *position*
(``ownRotation``/``ownScale: false``). This is the mechanism detector
geometry and event data share to move together under one alignment offset
(see e.g. the ``al-albrw`` plugin, which puts both its detector shapes and
its per-event hits/tracks under the group named ``"main"``).

Unlike the transformation groups :doc:`module-plotter` describes for its own
canvas, this module's groups carry a full 3D rotation and no logarithmic
scaling option -- the plotter document calls out that distinction from its
own side.

Items, highlighting and selection
-----------------------------------

Every pickable item gets three three.js handles under one group: ``base``
(always visible), ``highlight`` and ``selected`` (initially hidden overlay
copies, built via each geometry type's ``make_highlight_overlay_geometry``/
``make_selected_overlay_geometry``). Hover and selection are rendered by a
generic, type-agnostic silhouette pass (``hl-overlay.js``): the relevant
handle is put on a dedicated camera layer, rendered to a mask target,
dilated, and composited as an outline.

Hover comes from two independent sources -- raycasting in the 3D view and
row-hover in the Items panel -- unioned into one highlighted set. Selection
(shift+click in the 3D view, or the Items panel) is independent of hover and
persists until changed. Both can additionally be grouped/filtered by
``_facets``/``_classifiers`` via saved facet presets, and items can be
hidden (``hiddenGeoItemIDs``) without being deselected.

Whole-selection state (selected items *and* selected markers together, see
below) can be saved under a name and later re-applied with set semantics
(replace/union/intersect/subtract) -- ``store/selectionSets.js``, used by
``view3D.js``'s selection-set mutations.

Markers
-------

``PointMarkers`` renders a point cloud with a shared shape/size "sprite"
drawn onto a canvas texture (``markers.js``): built-in shapes include
filled/hollow circles, filled/hollow rectangles, and cross shapes
(``xCross``, ``plusCross``), each of the latter with a "hollow" variant.
A shape's mask (used for its highlight/selected overlay,
not its normal appearance) is drawn from the same path the shape itself
uses to draw its own outline, so a shape intended for use as a marker should
either enclose a fillable area or rely on its own stroke -- either way
produces a non-blank mask; only relying on an unfillable, suppressed-stroke
path would not.

Because one ``PointMarkers`` item can hold a very large number of points, two
things are handled at the *marker* level, separately from ordinary
whole-item hover/selection:

* **Hover** highlights every marker within the pointer's pixel radius across
  all pickable point clouds at once (``highlightedMarkers``, a per-item
  ``Set`` of indices) -- generous, to show everything reachable.
* **Selection** (shift+click) picks exactly one marker, the single nearest
  raycast hit, mirroring ordinary 3D-picking convention rather than the
  "everything under the cursor" behavior whole-item selection uses.
  Selecting a marker never selects its containing item.

Selected markers are shown in their own "Selected markers" side panel
(``SelectedMarkersPanel.vue``) rather than the Items panel -- deliberately:
the Items panel is one row per named item, and a single marker item can
carry far more points than is reasonable to list there. The markers panel
instead only ever lists the current (expected small) selection.

Cross-module interaction
--------------------------

**Stub.** How this module's concepts are meant to interact with *other*
viewer modules is not yet designed. Known open points, left here rather
than answered:

* :doc:`module-table`'s "Selection view" use case expects to render another
  module's selection as table rows, "regardless of which module the
  selection originated from" -- no such generic cross-module selection
  contract exists yet. Today, ``selectedGeoItemIDs``/``selectedMarkers`` are
  private to this module's own per-context Vuex state.
* :doc:`sources`' ``ResolverDeclaration`` ("associated data for objects
  picked on the scene, for detailed inspection") has a server-side contract
  (``viewer_server/plugins/contracts.py``) but no client-side consumer yet --
  it is unclear how a picked item's or marker's resolved data would surface
  in this module's UI, or whether that surfacing belongs to this module at
  all rather than to whatever displays the resolved data (e.g. a future
  tabular view).
* ``ClientExtensionDeclaration`` (plugin-supplied prebuilt ES modules) is
  likewise declared server-side with no client-side loader -- relevant if a
  plugin ever wants to contribute a new geometry/material type without a
  core rebuild.
* No dispatch equivalent to :doc:`module-table`'s "Plot dispatch" exists for
  sending a selection (items or markers) to another module for further
  analysis.
