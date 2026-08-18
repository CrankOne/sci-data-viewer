from __future__ import annotations
from flask import Blueprint, jsonify, request, url_for
from viewer_server.plugins.contracts import DataSourceDeclaration, SourceDescriptor
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
                enabledByDefault=False,  # TODO: enable for dev/debug?
            ),
            DataSourceDeclaration(
                id="demo.plot-showroom",
                url=__name__ + '.plot_source_descriptor',
                label="Testing plot showroom",
                enabledByDefault=False,
            ),
        )
    def resolvers(self):
        return ()

    def client_extensions(self):
        return ()

    def resources(self):
        return ()


def create_plugin() -> DemoViewerPlugin:
    return DemoViewerPlugin()
