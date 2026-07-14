from __future__ import annotations

from flask_restful import Resource

class SceneResource(Resource):
    """
    Development showroom objects.
    """
    def get(self):
        return {
            "iterable": True,
            "expiresIn": None,

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
                        #
                        "position": [0, 0, 0],
                        "sizes": [14, 14, 0.5],
                        "rotation": [0, 0, 0],
                    },
                    # Line and ColoredLineSegments demo, "tracks"
                    {   "_name": "reconstructedTrack",
                        "_type": "Line",
                        "_material": "defaultLineMaterial",
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
        }

