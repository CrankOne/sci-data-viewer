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
                        "wireframe": True,
                        "transparent": True,
                        "opacity": 0.15,
                        "color": 0xffffaa,
                    }, {"_name": "referenceTrackMaterial",
                        "_type": "LineDashedMaterial",
                        #
                        "color": 0xff7777,
                        "linewidth": 1,
                        "scale": 1,
                        "dashSize": 3,
                        "gapSize": 1,
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
                    # "reference track"
                    {   "_name": "referenceTrack",
                        "_type": "Line",
                        "_material": "referenceTrackMaterial",
                        "points": [
                                [-1.5, 5.6, -20],
                                [2.3, -3, 20],
                            ]
                    }
                ]
            }
        }

#@app.route("/static/<str:path>")
#def get_static_file(path):
#    send_from_directory(path)

#api.add_resource(resources.Events, '/events')

if __name__ == '__main__':
    app.run(debug=True)

