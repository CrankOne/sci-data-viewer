Plotter module
==============

A 2D function-plotting module is intended for 2D plot visualization, supporting
various styles of points, markers, polygons, curves, etc, with some limited
interactivity (zooming, panning, highlight and selection).

Purpose
-------

The module is read-only. It is intended primarily for inspection and selection
of the grouped data items.

Plotting layout
---------------

The panel occupied by a module is delimited onto regions::

    +---------------------------------+
    |        TB - title box           |
    +---------------------------------+
    | UH - upper horizontal axes box  |
    +------+------------------+-------+
    | LV - |                  | RV -  |
    | left |        MP -      | right |
    | vert |       Main       | vert  |
    | axes |     plotting     | axes  |
    | box  |       area       | box   |
    +------+------------------+-------+
    | LH - lower horizontal axes box  |
    +---------------------------------+

Axes boxes can hold an arbitrary number of graphical depictions of axes
belonging to different transformation domains, each scaled independently in
the application's state. When a box hosts more than one axis, an interaction
targets whichever axis is under the pointer at the time (position-based
hit-testing).

Supported interactions in the MP (affects all axes simultaneously):
- left drag: rectangular zoom;
- middle drag: pan;
- wheel: zoom around pointer;
- click: nearest-object selection;
- shift+drag: data selection;

Axes boxes:
- axis right click: opens a context menu (e.g. switch between linear/log2/
  log10 scale, zoom out) -- a plot-local UI element whose exact trigger and
  contents are an implementation detail, left open (see "Open questions");
- drag directly along an axis, drawing a sub-interval: alters only that
  axis's D3 domain (its scale's numeric range) -- the named transformation
  domain it belongs to, and any other axis in it, is left untouched.

Data
----

Data object provided by a data source consists of:
    - primitives
    - subject data

The payload's top-level envelope is ``plotData`` -- this module's own
type-specific envelope, per :doc:`sources`'s convention of one such envelope
per data type (e.g. geo3d's own ``geometryData``, :doc:`module-3d-viewer`):

.. code-block:: js

    {
        "plotData": {
            "primitives": [ ... ],
            "subjectData": { ... }
        }
    }

Domains
~~~~~~~

A *transformation domain* maps "real coordinates" used by primitives into the
pixel space of the canvas. Geometrical primitives often use real coordinates to
position their layout on the (MP).
For instance, for a complex marker such as a stat. box with whiskers (see
"Markers" below), the *transformation domain* will affect the distance
between median line and whiskers, but the actual size (defined in px) of a
simple point marker remains unchanged. What dimensions are affected is
defined (and explicitly documented) by the implementation of the particular
geometrical primitive.

Not to be confused with D3's own "domain" (an axis scale's numeric input
range, e.g. ``d3-scale``'s ``.domain()`` -- see "Implementation" below): this
document uses *transformation domain* only for the named, per-item-opt-in
mapping described above. Wherever the D3 sense is meant instead, it is
called out explicitly as "D3's domain", in both docs and code.

Notable differences between this module's transformation domain and
:doc:`module-3d-viewer`'s transformation group:
- no rotation;
- no 3rd dimension;
- a possibility to set log10 or log2 scaling transform.

Primitives
~~~~~~~~~~

The data source provides items to be plotted in the (MP). List
of items:
    - markers -- from **simple markers** (points, crosses, etc.) to
      **complex markers** such as a stat. box, optionally with whiskers and
      notch (see "Markers" below);
    - raster texture with alpha channel (for backgrounds and massive
      scatterplots);
    - path -- line, arrow, cubic Bezier curve or (filled) polygon.
These items at the side of client app must be understood as geometrical
primitives, *not* as abstract data. For instance, it is not possible at the
client side to switch from point markers to stairs if point markers are the
bins of 1D histogram.

Common properties for every item:
- A type (``_type``) defining how the rest of the object should be interpreted.
- Selection (``_facets``) facets -- an object of key/value pair for advanced
  grouping and querying on the client side.
- Transformation domain name (``_transfDomain``).

Markers
~~~~~~~

**Point markers** (simple markers) are defined by their positions and marker
type in use. Example data:

.. code-block:: js

    {
        "_type": "markers",
        "_facets": {"foo": "bar", "one": "two"},
        "_transfDomain": "main",

        "marker-type": "x-cross",
        "data": [[0.1, 2.3], [3.4, 5.6]]
    }

**Polyline** a sequence of moveTo+LineTo, optionally filled; besides of filling
enclosed or open polygon, filling can be set up to one of four plot edges.
Filling can have color, alpha channel and pattern -- one of pre-defined tiles
or programmatically-generated strokes and dithering.

A polyline may set its own stroke style via ``dash``: a Canvas
``setLineDash``-compatible array of numbers (e.g. ``[6, 3]``); omitted or
empty means solid. This is the primitive's own explicit choice -- the
broader facet-based styling sub-panel "Styling" above anticipates is
separate, larger, and still undesigned.

**Raster picture** (bitmap). See "Styling" below for a note on appearance
limits anticipated for especially demanding raster content.

**TODO**: :doc:`module-3d-viewer` implements an independent point-marker
system of its own (``modules/three-view/markers.js``, WebGL sprite
textures) that overlaps this module's shape vocabulary -- both call a cross
marker ``xCross``/``x-cross`` -- without sharing any code with this module's
directly-drawn Canvas2D paths (``modules/plotter/draw.js``). See that
module's Markers section for the open question of whether shape
definitions should be unified across the two rendering backends.

A **bars marker** (a complex marker): from a simple line segment denoting an
error bar, to a complex box with notch and whiskers plot, oriented vertically
or horizontally.

Subject data
~~~~~~~~~~~~

Any data associated to a primitive: an application-defined payload the
client passes through without interpreting.

Desks
-----

One **desk** is this module's own contextual scope -- a ``plot`` context in
:doc:`ui-session` terms: one item store, one set of transformation domains,
one hover/selection state. The source/scope/view relation for this module is
``source -> desk -> plot`` (view), one instantiation of the generic
source/context/viewport-instance pattern every contextual module follows
(:doc:`ui-session`'s "Extension points"). "Desk" and "plot" are simply this
module's own names for its context and its viewport; a module picks its own
vocabulary here rather than sharing one across module boundaries, since two
modules' items and drawables have nothing to do with each other regardless
of how similar the underlying mechanism is (:doc:`module-3d-viewer` names the
equivalent concepts "scene" and "viewport" for itself, for the same reason).

Several data sources may attach to the same desk simultaneously, each kept in
its own namespace, and a desk may back more than one plot (view) -- both
provided directly by the generic context mechanism, not something this
module implements itself.

A desk does not need incremental, per-item update tracking: the plotter has
no primitive whose update pattern calls for one item being preserved across
a payload refresh without rebuilding the rest, so a resource's payload is
simply replaced wholesale on every update, keyed by resource name so several
sources can share one desk without colliding (``store/plotDesk.js``).

Styling
-------

Styling affect non-bitmap drawables and implies:
- Point marker color and shape;
- Line width and stroke style;
- Fill patterns and color.

In a new :doc:`ui-session` a "default" style is in use for all the plotted items.
There is a sub-panel widget to administer facet-based rules to assign
different styles based on facets.

Some raster content is expected to be too demanding for client-side styling
control -- dense heatmaps and rasterized massive scatterplots may need to be
rendered server-side, with some appearance details effectively fixed rather
than user-adjustable. This is anticipated but not designed here; treat it as
a reserved, distant-future special case (see "Open questions").

Implementation
--------------

The module relies on D3.js for:
- coordinate transformation (``d3-scale`` -- linear, log2, log10, etc. Note:
  wherever D3's own "domain"/"range" terminology is used, in docs or code,
  call it out explicitly as "D3's domain" to avoid confusion with this
  module's own *transformation domain* concept, see "Domains" above);
- deriving ticks and grid values, perhaps coordinate layout;
- (?) zooming (``d3-zoom``).
I.e. D3.js provides part of the logical machinery, but not common drawing,
layout, reactivity.

The widget itself is drawn as HTML Canvas 2D with HTML/SVG layer on top. The
goal is to provide pixel-perfect, precise rendering of the data (generally, no
anti-aliasing and other visual improvements capable to hide subtle data
features).

The HTML/SVG overlay is responsible for showing:
- tick labels,
- axis labels,
- mouse UI and event handling (backed by Vue),
- overimposed tooltip-like messages.

The Canvas 2D is responsible for actual drawing:
- axes
- grids
- "ordinary" histograms
- polylines
- modest scatterplots.

(Additionally/instead of Canvas 2D we should possibly consider WebGL for huge
scatterplots and dense heatmaps in future?)

A dev memo/explicit concern: CSS pixels and device pixels are not the same
on HiDPI displays. Canvas normally needs to have its backing store scaled
according to the device pixel ratio. Make sure we have predictable physical
resolution here. MDN explicitly distinguishes ``devicePixelRatio`` as the
ratio between physical and CSS pixels.

Open questions
--------------

**Stub.** Left here rather than answered:

* **Answered** -- "a source updates a scope, a scope fans out to N
  dependent views" is already one shared abstraction: any contextual module
  goes through :doc:`ui-session`'s ``contexts/create_context`` and
  ``sceneCreation.js``'s ``create_scene_with_viewport`` (dataType-
  parametrized despite the name), same as :doc:`module-3d-viewer`. Only the
  vocabulary differs ("desk"/"plot" here, "scene"/"viewport" there), and
  that's deliberate (see "Desks" above). What actually remained open here
  was one level in -- the *content* of a context's own state -- covered by
  the next point.
* **Answered (shape, and now built), open (this module's UX)** --
  :doc:`ui-session`'s "Selection sinks" provides the generic cross-module
  *dispatch* mechanism (a context's ``sinkTargets`` pointer, manual one-shot
  send); :doc:`ui-session`'s "Selection model" decides -- and, as of the
  container itself, now implements -- the generic *shape* this module's own
  selection state would take: a ``selection`` context module
  (``store/selection.js``) three-view already registers itself as the first
  consumer of, dataType-neutral fields, algebra in
  ``store/selectionAlgebra.js``. This module would only need to register the
  same ``contextStoreModules.selection`` entry to get it -- no new store
  plumbing. Per-primitive-type sub-item-selection gating is not built yet
  (still "Selection model"'s own open item), nor is this module's own UX on
  top of the shape: likely nearest-object click selection, persisting until
  changed, independent of hover, adapted for 2D specifics (e.g. what
  "shift+drag: data selection" actually selects, and which of this module's
  primitive types -- almost certainly ``markers``, unlikely paths/raster --
  declare themselves open to sub-item selection at all).
* The axis right-click menu (linear/log2/log10, zoom out) is a plot-local,
  component-level UI element; its exact trigger (including any modifier-key
  semantics) and contents are an implementation detail expected to change,
  not fixed by this document.
* Reserved, distant-future special case: appearance limits for demanding
  raster content (dense heatmaps, rasterized massive scatterplots) that may
  need server-side rendering -- see "Styling".
