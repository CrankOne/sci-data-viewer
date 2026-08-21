from __future__ import annotations
from flask import Blueprint, jsonify, request, url_for
from viewer_server.plugins.contracts import (
    DataSourceDeclaration, PluginConfig, SourceDescriptor, plugin_params,
)
import random
import time  # XXX

# A Flask blueprint containing all plugin's resources
blueprint = Blueprint(
    "demo",
    __name__,
    url_prefix="/plugins/demo",
)

# Plugin's descriptor reportinf on its content and primary data URL
@blueprint.get("/source")
def source_descriptor():
    #time.sleep(4.0)  # dev note: uncomment to test manifest fetch mgmnt

    # A plain source (doc/sources.rst): neither sequential nor addressable,
    # `GET data-url` returns the geometry payload directly.
    return jsonify(SourceDescriptor(
        data_url=url_for(__name__ + '.geometry'),
        extra={"type": "geo3d"},  # mandatory for 3D viewer
    ).to_json())

@blueprint.get("/plot-source")
def plot_source_descriptor():
    # Same shape as source_descriptor() above, but for the plotter module
    # (doc/module-plotter.rst) instead of the 3D viewer -- a plain source,
    # `GET data-url` returns the plot payload directly.
    return jsonify(SourceDescriptor(
        data_url=url_for(__name__ + '.plot_data'),
        extra={"type": "plot"},  # mandatory for the plotter module
    ).to_json())

@blueprint.get("/plot-data")
def plot_data():
    # Matches doc/module-plotter.rst's "Data" section: a `plotData` envelope
    # holding `primitives` (`subjectData` has no shape decided yet -- see
    # the doc's "Open questions" -- so it's omitted here rather than guessed
    # at). Values mirror client/src/modules/plotter/sample-data.js so the
    # two stay easy to compare while the plotter module isn't wired up to
    # consume this yet.
    return jsonify({
        "plotData": {
            "primitives": [
                {
                    "_type": "markers",
                    "_facets": {"series": "alpha"},
                    "_transfDomain": "main",
                    "marker-type": "x-cross",
                    "data": [
                        [0.5, 1.2], [1.8, 3.4], [3.2, 0.8], [4.7, 4.1],
                        [6.1, 2.0], [7.5, 3.8], [8.9, 1.4],
                    ],
                },
                {
                    "_type": "polyline",
                    "_facets": {"series": "beta"},
                    "_transfDomain": "main",
                    "closed": False,
                    "data": [
                        [0, 0.5], [2, 1.5], [4, 1.0],
                        [6, 3.2], [8, 2.4], [10, 4.0],
                    ],
                },
            ],
        },
    })

@blueprint.get("/table-source")
def table_source_descriptor():
    # Same shape as source_descriptor()/plot_source_descriptor() above, but
    # for the tabular module (doc/module-table.rst) -- a plain source,
    # `GET data-url` returns the table payload directly. Not yet
    # row-windowed (doc/sources.rst's "Row-window pagination") -- this demo
    # source is small enough to return whole.
    return jsonify(SourceDescriptor(
        data_url=url_for(__name__ + '.table_data'),
        extra={"type": "table"},  # mandatory for the tabular module
    ).to_json())

@blueprint.get("/table-data")
def table_data():
    # Matches doc/module-table.rst's "Schema and columns"/"Table data
    # source" sections: a `tableData` envelope holding `schema` -- a column
    # *tree* (modules/table/schema.js), grouping "Fitted"/"Truth" the same
    # way the doc's own hierarchical-columns example does -- and `rows`,
    # each carrying a stable `_id` distinct from its column values (doc's
    # "Selection" section: row identity must never be derived from array
    # position). Leaf ids are flat, dotted strings ("fitted.x") rather than
    # nested row objects -- a leaf's identity doesn't depend on how its
    # group happens to be nested.
    return jsonify({
        "tableData": {
            "schema": {
                "columns": [
                    {"id": "trackId", "label": "Track", "type": "string"},
                    {"id": "chi2", "label": "chi²", "type": "number"},
                    {"label": "Fitted", "children": [
                        {"id": "fitted.x", "label": "x", "type": "number", "units": "mm"},
                        {"id": "fitted.y", "label": "y", "type": "number", "units": "mm"},
                    ]},
                    {"label": "Truth", "children": [
                        {"id": "truth.x", "label": "x", "type": "number", "units": "mm"},
                        {"id": "truth.y", "label": "y", "type": "number", "units": "mm"},
                    ]},
                    {"id": "nHits", "label": "# hits", "type": "integer"},
                ],
            },
            "rows": [
                {"_id": "trk-001", "trackId": "trk-001", "chi2": 1.24, "fitted.x": 12.3, "fitted.y": -4.5, "truth.x": 12.1, "truth.y": -4.6, "nHits": 7},
                {"_id": "trk-002", "trackId": "trk-002", "chi2": 0.87, "fitted.x": -5.1, "fitted.y": 8.2, "truth.x": -5.0, "truth.y": 8.3, "nHits": 9},
                {"_id": "trk-003", "trackId": "trk-003", "chi2": 2.31, "fitted.x": 3.4, "fitted.y": -1.8, "truth.x": 3.6, "truth.y": -1.7, "nHits": 5},
                {"_id": "trk-004", "trackId": "trk-004", "chi2": 1.05, "fitted.x": 9.9, "fitted.y": 4.4, "truth.x": 9.8, "truth.y": 4.5, "nHits": 8},
                {"_id": "trk-005", "trackId": "trk-005", "chi2": 3.72, "fitted.x": -8.6, "fitted.y": -6.3, "truth.x": -8.9, "truth.y": -6.1, "nHits": 4},
                {"_id": "trk-006", "trackId": "trk-006", "chi2": 0.44, "fitted.x": 1.2, "fitted.y": 2.9, "truth.x": 1.3, "truth.y": 2.8, "nHits": 11},
            ],
        },
    })

_TABLE_RANDOM_ROW_COUNT = 220
_TABLE_RANDOM_PAGE_SIZE_DEFAULT = 40
_TABLE_RANDOM_PAGE_SIZE_MAX = 100

_TABLE_RANDOM_SCHEMA = {
    "columns": [
        {"id": "eventId", "label": "Event", "type": "string"},
        {"id": "chi2", "label": "chi²", "type": "number"},
        {"id": "x", "label": "x", "type": "number", "units": "mm"},
        {"id": "y", "label": "y", "type": "number", "units": "mm"},
        {"id": "nHits", "label": "# hits", "type": "integer"},
    ],
}

def _generate_table_random_rows():
    # Deterministic (fixed seed) rather than actually random -- a demo
    # fixture needs to look the same across requests/reloads, not be
    # unpredictable.
    rng = random.Random(42)
    return [
        {
            "_id": f"evt-{i:04d}",
            "eventId": f"evt-{i:04d}",
            "chi2": round(rng.uniform(0.1, 5.0), 2),
            "x": round(rng.uniform(-100, 100), 1),
            "y": round(rng.uniform(-100, 100), 1),
            "nHits": rng.randint(2, 20),
        }
        for i in range(_TABLE_RANDOM_ROW_COUNT)
    ]

_TABLE_RANDOM_ROWS = _generate_table_random_rows()

@blueprint.get("/table-random-source")
def table_random_source_descriptor():
    # Same shape as table_source_descriptor() above, but declaring doc/
    # sources.rst's "Row-window pagination" (a `rows` descriptor object) --
    # large enough (220 rows) that fetching it whole, the way
    # demo.table-showroom's small fixed set does, would defeat the point.
    return jsonify(SourceDescriptor(
        data_url=url_for(__name__ + '.table_random_data'),
        extra={
            "type": "table",
            "rows": {
                "windowed": True,
                "page-size": _TABLE_RANDOM_PAGE_SIZE_DEFAULT,
                "max-page-size": _TABLE_RANDOM_PAGE_SIZE_MAX,
            },
        },
    ).to_json())

@blueprint.get("/table-random-data")
def table_random_data():
    # Row-window pagination (doc/sources.rst): `page`/`page-size` default to
    # the descriptor's own `rows.page-size` when the client omits them
    # (mirroring "Addressable capability"'s identical default-page-size
    # behavior), and are clamped to `rows.max-page-size` rather than
    # rejected outright.
    try:
        page = int(request.args.get("page", 0))
    except ValueError:
        page = 0
    try:
        page_size = int(request.args.get("page-size", _TABLE_RANDOM_PAGE_SIZE_DEFAULT))
    except ValueError:
        page_size = _TABLE_RANDOM_PAGE_SIZE_DEFAULT
    page = max(page, 0)
    page_size = max(1, min(page_size, _TABLE_RANDOM_PAGE_SIZE_MAX))

    # Server-driven sorting (doc/module-table.rst's "Sorting") -- a
    # convention local to this demo's row-window adapter (connection.js's
    # fetch_row_window), not part of doc/sources.rst's own pagination spec.
    # Only a schema-declared leaf column is ever sorted on, never an
    # arbitrary client-supplied attribute name.
    sortable_columns = {"eventId", "chi2", "x", "y", "nHits"}
    sort_column = request.args.get("sort-column")
    sort_direction = request.args.get("sort-direction", "asc")
    rows_source = _TABLE_RANDOM_ROWS
    if sort_column in sortable_columns:
        rows_source = sorted(
            _TABLE_RANDOM_ROWS,
            key=lambda row: row[sort_column],
            reverse=(sort_direction == "desc"),
        )

    start = page * page_size
    rows = rows_source[start:start + page_size]

    return jsonify({
        "tableData": {
            "schema": _TABLE_RANDOM_SCHEMA,
            "rows": rows,
            "page": page,
            "page-size": page_size,
            "total": len(_TABLE_RANDOM_ROWS),
        },
    })

@blueprint.get("/graph-source")
def graph_source_descriptor():
    # Same shape as source_descriptor()/plot_source_descriptor()/
    # table_source_descriptor() above, but for the block diagram module
    # (doc/module-graph.rst) -- a plain source, `GET data-url` returns the
    # graph payload directly.
    return jsonify(SourceDescriptor(
        data_url=url_for(__name__ + '.graph_data'),
        extra={"type": "graph"},  # mandatory for the block diagram module
    ).to_json())

@blueprint.get("/graph-data")
def graph_data():
    # Matches doc/module-graph.rst's "Data" section: a `graphData` envelope
    # holding an optional `layout` hint plus `nodes`/`edges`. A small FSM --
    # states as nodes, transitions as labeled directed edges, including one
    # back-edge (Paused -> Running on "resume") so the demo exercises
    # dagre's cycle-breaking, not just a tree. Each node/edge carries a
    # small illustrative `subjectData` purely so "Selection and forwarding"
    # has something concrete to snapshot and dispatch, even while the
    # plotter side of that dispatch remains a stub.
    return jsonify({
        "graphData": {
            "layout": {"direction": "TB"},
            "nodes": [
                {
                    "_id": "idle", "label": "Idle", "shape": "rounded",
                    "_facets": {"kind": "state"},
                    "subjectData": {"meanDurationMs": 0, "samples": []},
                },
                {
                    "_id": "running", "label": "Running", "shape": "rounded",
                    "_facets": {"kind": "state"},
                    "subjectData": {"meanDurationMs": 842, "samples": [720, 810, 905, 880, 895]},
                },
                {
                    "_id": "paused", "label": "Paused", "shape": "rounded",
                    "_facets": {"kind": "state"},
                    "subjectData": {"meanDurationMs": 1350, "samples": [900, 1400, 1800, 1250]},
                },
                {
                    "_id": "stopped", "label": "Stopped", "shape": "ellipse",
                    "_facets": {"kind": "final-state"},
                    "subjectData": {"meanDurationMs": 0, "samples": []},
                },
                {
                    "_id": "error", "label": "Error", "shape": "diamond",
                    "_facets": {"kind": "final-state"},
                    "subjectData": {"meanDurationMs": 0, "samples": []},
                },
            ],
            "edges": [
                {
                    "_id": "t-idle-running", "from": "idle", "to": "running", "label": "start",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 214},
                },
                {
                    "_id": "t-running-paused", "from": "running", "to": "paused", "label": "pause",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 96},
                },
                {
                    "_id": "t-paused-running", "from": "paused", "to": "running", "label": "resume",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 88},
                },
                {
                    "_id": "t-running-stopped", "from": "running", "to": "stopped", "label": "stop",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 118},
                },
                {
                    "_id": "t-paused-stopped", "from": "paused", "to": "stopped", "label": "stop",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 8},
                },
                {
                    "_id": "t-running-error", "from": "running", "to": "error", "label": "fault",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 5},
                },
                {
                    "_id": "t-error-idle", "from": "error", "to": "idle", "label": "reset",
                    "_facets": {"kind": "transition"},
                    "subjectData": {"count": 5},
                },
            ],
        },
    })

@blueprint.get("/geometry")
def geometry():
    # Later, query parameters can select an event, time slice,
    # collection interval, or other application state.
    #event_id = request.args.get("event")

    return jsonify({
            "geometryData": {
                "materials": [
                    {   "_name": "exampleVolumeMaterial",
                        "_type": "MeshMaterial",
                        #
                        #"wireframe": True,
                        "transparent": True,
                        "opacity": 0.55, #0.15,
                        "color":  0x3286cd, #0xffffaa,
                    }, {"_name": "reconstructedTrackMaterial",
                        "_type": "LineMaterial",
                        #
                        "lineStrokeType": "dashed",
                        "color": 0xff7777,
                        "linewidth": 1,
                        "scale": 1,
                        "dashSize": 3,  #< NOTE: does not work for three.js
                        "gapSize": 1,
                    }, {
                        "_name": "basicWhiteLineMaterial",
                        "_type": "LineMaterial",
                        #
                        #"linewidth": 5,  # not supported unfortunately
                        "color": 0xffffff,
                        "vertexColors": True
                    }, {
                        "_name": "dashedLineMaterial",
                        "_type": "ColoredLineShaderMaterial",
                        # ...? TODO: shader, shader parameters, etc
                    }, {
                        "_name": "markersMat1",
                        "_type": "PointMarkersShaderMaterial",
                        #
                        'shape': 'xCross',
                        'flags': 0x0,
                        'size': 16,
                    }, {
                        "_name": "markersMat2",
                        "_type": "PointMarkersShaderMaterial",
                        #
                        'shape': 'hollowXCross',
                        #'flags': 0x3,  # set it to get a color-filled marker
                        'size': 16,
                    }, {
                        "_name": "texture1",
                        "_type": "MeshMaterial",
                        #
                        "texture": "cdn/colored-checker-texture.png"
                    }
                ],
                "geometry": [
                    # BoxGeometry demo -- a "detector boxes"
                    {   "_name": "det1",
                        "_type": "BoxGeometry",
                        "_material": "defaultMeshMaterial",
                        #
                        "_category": ["detectors", "GEMs"],
                        "_tags": ["solid", "demo"],
                        "_transfGroup": {"name": "main", "scale": None},
                        #
                        "position": [0, 0, -10],
                        "sizes": [7.5, 17.5, 1],
                        "rotation": [0, 12, 6.5],
                        #"touchable": "detectors/GEMs"  #< camera can be centered on object, value defines path in scene tree
                        #"titleOnHover": "..."  #< message shown when mouse hovered (prints coordinates, etc)
                        # ...
                    }, {"_name": "det2",
                        "_type": "BoxGeometry",
                        "_material": "defaultMeshMaterial",
                        "_transfGroup": "main",
                        #
                        "_category": ["detectors", "GEMs"],
                        "_tags": ["solid", "demo"],
                        #
                        "position": [0, 0, 10],
                        "sizes": [15, 8.3, 0.5],
                        "rotation": [-3.4, 0, -4.5],
                    }, {"_name": "det3",
                        "_type": "BoxGeometry",
                        "_material": "exampleVolumeMaterial",
                        #
                        "_category": ["detectors", "GEMs"],
                        "_tags": ["solid", "demo"],
                        "_transfGroup": "main",
                        #
                        "position": [0, 0, 0],
                        "sizes": [14, 14, 0.5],
                        "rotation": [0, 0, 0],
                    },
                    # Line and ColoredLineSegments demo, "tracks"
                    {   "_name": "reconstructedTrack",
                        "_type": "Line",
                        "_material": "defaultLineMaterial",
                        "_transfGroup": "main",
                        #
                        "_category": ["tracks"],
                        "_tags": ["lines", "demo"],
                        #
                        "points": [
                                [-1.5, 5.6, -20],
                                [2.3, -3, 20],
                            ]
                    }, {"_name": "detXXX",
                        "_type": 'ColoredLineSegments',
                        '_material': "basicWhiteLineMaterial",
                        "_transfGroup": "main",
                        #
                        "_category": ["detectors"],
                        "_tags": ["lines", "demo"],
                        #
                        "points": [
                            [[-10, -10, -10], [0, 0, 1]],
                            [[-10,  10, -10], [0, 1, 0]],
                            [[-10,  10,  10], [0, 1, 1]],
                            [[ 10,  10,  10], [1, 1, 0]],
                        ]
                    }, {"_name": "referenceTrack",
                        "_type": "ColoredLineSegments",
                        "_material": "dashedLineMaterial",
                        "_transfGroup": "main",
                        #
                        "_category": ["tracks"],
                        "_tags": ["lines", "demo"],
                        #
                        "points": [
                                [[-0.65, 5.45, -19.8],   [0, 1, 1]],
                                [[3.38,  -1.1,  17.2],   [0, 0, 1]],
                                [[4.38,   3.1,  23.2],   [0, 0, 1]],
                            ]
                    },
                    # Various point markers demo, "hits"
                    {
                        "_name": "hits1",
                        "_type": "PointMarkers",
                        "_material": "markersMat1",
                        "_transfGroup": "main",
                        "_pickable": True,  # TODO: False breaks state in items list widget (simple issue)
                        #
                        "_category": ["hits"],
                        "_tags": ["points", "demo"],
                        #
                        "items": [
                            { "position": [-2, -3, -4], "color": [0.3, 0.4, 0.5], "size": 17 },
                            { "position": [ 2,  3, -4], "color": [0.9, 0.4, 0.2], "size": 32 },
                        ]
                    }, {
                        "_name": "hits2",
                        "_type": "PointMarkers",
                        "_material": "markersMat2",
                        "_transfGroup": "main",
                        "_pickable": True,
                        #
                        "_category": ["hits"],
                        "_tags": ["points", "demo"],
                        #
                        "items": [
                            { "position": [12, -9, -8], "color": [0.9, 0.4, 0.8] },
                            { "position": [32, 18, 19], "color": [0.9, 0.4, 0.2] },
                        ]
                    },
                    # Textured quads demo
                    {
                        "_name": "plane1",
                        "_type": "Plane",
                        "_material": "texture1",
                        "_transfGroup": "main",
                        #
                        "_category": ["detectors"],
                        "_tags": ["planes", "demo"],
                        #
                        "position": [0, 0, 10],
                        "sizes": [7.5, 17.5],
                        "rotation": [23.23, -12, 6.5],
                    }
                ]
            }
        })

class DemoViewerPlugin:
    id = "demo"  # should match entry point name from pyproject.toml
    def blueprints(self):
        return (blueprint,)

    def data_sources(self):
        return (
            DataSourceDeclaration(
                id="demo.showroom",
                url=__name__ + '.source_descriptor',
                # ^^^ url_for(__name__ + '.source_descriptor') won't work
                #     outside of app ctx, so resolution is postponed
                label="Testing geometry showroom",
            ),
            DataSourceDeclaration(
                id="demo.plot-showroom",
                url=__name__ + '.plot_source_descriptor',
                label="Testing plot showroom",
            ),
            DataSourceDeclaration(
                id="demo.table-showroom",
                url=__name__ + '.table_source_descriptor',
                label="Testing table showroom",
            ),
            DataSourceDeclaration(
                id="demo.table-random-access-showroom",
                url=__name__ + '.table_random_source_descriptor',
                label="Testing table showroom (random-access, row-windowed)",
            ),
            DataSourceDeclaration(
                id="demo.graph-showroom",
                url=__name__ + '.graph_source_descriptor',
                label="Testing block diagram showroom (FSM)",
            ),
        )
    def resolvers(self):
        return ()

    def client_extensions(self):
        return ()

    def resources(self):
        return ()


# No configurable parameters -- this fixture is static -- but the
# decorator is still applied so `--list-plugins` reports "no parameters"
# explicitly rather than silently omitting the plugin's schema.
@plugin_params()
def create_plugin(config: PluginConfig) -> DemoViewerPlugin:
    return DemoViewerPlugin()
