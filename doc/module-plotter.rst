Plotter module
==============

A 2D function-plotting module is intended for 2D plot visualization, supporting
various styles of points, markers, polygons, curves, etc, with some limited
interactivity (zooming, panning, highlight and selection).

Purpose
-------

The module is read-only. It is intended primarily for inspection and selection
of the grouped data items.

Plotting canvas
---------------

Delimited onto regions::

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

Data
----

Data object provided by a data source consists of:
    - primitives
    - subject data

Should be provided in "plot" payload.

Transformation groups
~~~~~~~~~~~~~~~~~~~~~

A *transformation group* maps "real coordinates" used by primitives into the
pixel space of the canvas. Geometrical primitives often use real coordinates to
position their layout on the (MP).
For instance, for stat. box with wiskers, the *transformation group* will
affect the distance between median line and wiskers, but actual size (in px)
of point marker remains unchanged. What dimensions are affected is defined
(and explicitly documented) by an implementation of particular geometrical
primitive.

An important and crucial distinction from transformation group used for 3D
viewer, besides of absence of rotation and 3rd dimension: *there is an option
to set log10 or log2 scaling transform* for plotting transformation groups.

Primitives
~~~~~~~~~~

The data source provides items to be plotted in the (MP). List
of items:
    - markers -- simple points, crosses, etc, to more complex
      stat. box (optionally, with wiskers and notch);
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
- Transformation group name (``_transfGroup``).
- A data group (``_group``) affiliation effectively defining styling of the
  plot.

Markers
~~~~~~~

**Point markers** are defined by their positions and marker type in use.
Example data:

    .. code-block:: js

    {
        "_type": "markers",
        "_facets": { "foo": "bar, "one": "two" },
        "_transfGroup": "main",
        "_dgroup": "uno",

        "marker-type": "x-cross",
        "data": [[0.1, 2.3], [3.4, 5.6]]
    }

Subject data
~~~~~~~~~~~~

Any data associated to a primitive, similar to one from 3D viewer.

