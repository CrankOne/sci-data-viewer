from flask import Flask #, send_from_directory
from flask_cors import CORS, cross_origin
from flask_restful import Api

import resources

app = Flask(__name__
        , static_url_path='/static'
        , static_folder='client/'
        )
cors = CORS(app)
app.config['CORS_HEADERS'] = 'Content-Type'
api = Api(app)

@app.route("/")
def index_view():
    return """<!DOCTYPE html>
<html>
<head>
  <title>Viewer</title>
  <meta charset="UTF-8" />
  <link rel="stylesheet" type="text/css" href="/static/style.css"/>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="static/app.js"></script>
</body>
</html>"""

#
# Static scene showing all the available objects, a showroom
@app.route("/scene")
@cross_origin()
def default_scene():
    return {
            "iterable": True,
            "expiresIn": None,

            "geometryData": {
                "materials": [
                    {   "_name": "defaultDetMaterial",
                        "_type": "MeshBasicMaterial",
                        #
                        #"wireframe": True,
                        "transparent": True,
                        "opacity": 0.15,
                        "color": 0xffffaa,
                    }, {"_name": "reconstructedTrackMaterial",
                        "_type": "LineDashedMaterial",
                        #
                        "color": 0xff7777,
                        "linewidth": 1,
                        "scale": 1,
                        "dashSize": 3,  #< NOTE: does not work for three.js
                        "gapSize": 1,
                    }, {
                        "_name": "basicWhiteLineMaterial",
                        "_type": "LineBasicMaterial",
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
                        'flags': 0x3,
                        'size': 32,
                    }
                ],
                "geometry": [
                    # "detector boxes"
                    {   "_name": "det1",
                        "_type": "BoxGeometry",
                        "_material": "defaultDetMaterial",
                        #
                        "position": [0, 0, -10],
                        "sizes": [7.5, 17.5, 1],
                        "rotation": [0, 12, 6.5],
                        #"touchable": "detectors/GEMs"  #< camera can be centered on object, value defines path in scene tree
                        #"titleOnHover": "..."  #< message shown when mouse hovered (prints coordinates, etc)
                        # ...
                    }, {"_name": "det2",
                        "_type": "BoxGeometry",
                        "_material": "defaultDetMaterial",
                        #
                        "position": [0, 0, 10],
                        "sizes": [15, 8.3, 0.5],
                        "rotation": [-3.4, 0, -4.5],
                    }, {"_name": "det3",
                        "_type": "BoxGeometry",
                        "_material": "defaultDetMaterial",
                        #
                        "position": [0, 0, 0],
                        "sizes": [14, 14, 0.5],
                        "rotation": [0, 0, 0],
                    },
                    # "reconstructed track"
                    {   "_name": "reconstructedTrack",
                        "_type": "Line",
                        "_material": "reconstructedTrackMaterial",
                        "points": [
                                [-1.5, 5.6, -20],
                                [2.3, -3, 20],
                            ]
                    }, {"_name": "detXXX",
                        "_type": 'ColoredLineSegments',
                        '_material': "basicWhiteLineMaterial",
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
                        "points": [
                                [[-0.65, 5.45, -19.8],   [0, 1, 1]],
                                [[3.38,  -1.1,  17.2],   [0, 0, 1]],
                                [[4.38,   3.1,  23.2],   [0, 0, 1]],
                            ]
                    }, {
                        "_name": "hits1",
                        "_type": "PointMarkers",
                        "_material": "markersMat1",
                        #
                        "items": [
                            { "position": [-2, -3, -4], "color": [0.3, 0.4, 0.5], "size": 17 },
                            { "position": [ 2,  3, -4], "color": [0.9, 0.4, 0.2], "size": 32 },
                        ]
                    }, {
                        "_name": "hits2",
                        "_type": "PointMarkers",
                        "_material": "markersMat2",
                        #
                        "items": [
                            { "position": [12, -9, -8], "color": [0.9, 0.4, 0.8], "size": 12 },
                            { "position": [32, 18, 19], "color": [0.9, 0.4, 0.2], "size": 18 },
                        ]
                    }
                ]
            }
        }

#
# Sparse collection with pagination
# Pretty much like real RESTful application should look like
#@app.route("/example-items")
#@cross_origin()
#def example_items():
#    """
#    This view must should not provide geometrical data by its own, but instead
#    it returns description of collection that can be browsed.
#    """
#    return {
#            'iterable': True,
#            'total': 100,
#            'items': [1, 2, 3, 5],
#            'pages': [
#                    {}
#                ]
#        }

#@app.route("/static/<str:path>")
#def get_static_file(path):
#    send_from_directory(path)

#api.add_resource(resources.Events, '/events')

if __name__ == '__main__':
    app.run(debug=True)

