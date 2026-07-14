from flask_restful import Resource
from flask import request, url_for

class Settings(Resource):
    def get(self):
        return {
                #"rotationOrder": ""
                #"keepCameraOnResourceSwitch": ...
                #"camera": ...
                #"light" ...
            }

# This is only for example
class Events(Resource):
    def get(self):
        # example of infinite only-forward collection
        return {
                "total": None, "first": None, "last": None, "pages": None, "currentPage": None,
                "current": 1
            }
        # draft example of paginated collection
        #currentPage = int(request.args.get('page', 1))
        #return {
        #        "total": 10,
        #        "first": '1',
        #        "last": '12',
        #        "pages": 3,
        #        "currentPage": currentPage,
        #        "_links": {
        #            "self": {'href': url_for('rawdata.runs')},
        #            "next": {'href': url_for('rawdata.runs', page=2)},
        #            "find": {'href': '/rawdata/index/run/{runNo}', 'templated': True}  # NOTE: templated HAL URL
        #        },
        #        "_embedded": {
        #            "items": []
        #        }
        #    }

class Event(Resource):
    def get(self):
        return {
                "materials": [
                    {   "_name": "defaultDetMaterial",
                        "_type": "MeshBasicMaterial",
                        #
                        "wireframe": True,
                        "transparent": True,
                        "opacity": 0.15,
                        "color": 0xffffaa,
                    }, {"_name": "referenceTrackMaterial",
                        "color": 0xff7777,
                        "linewidth": 1,
                        "scale": 1,
                        "dashSize": 3,
                        "gapSize": 1,
                    }
                ],
                "primitives": [
                    # "detector boxes"
                    {   "_name": "det1",
                        "_type": "BoxGeometry",
                        "_material": "defaultDetMaterial",
                        #
                        "position": [0, 0, -1],
                        "sizes": [0.75, 1.75, 0.1],
                        "rotation": [0, 12, 6.5],
                        #"touchable": "detectors/GEMs"  #< camera can be centered on object, value defines path in scene tree
                        #"titleOnHover": "..."  #< message shown when mouse hovered (prints coordinates, etc)
                        # ...
                    }, {"_name": "det2",
                        "_type": "BoxGeometry",
                        "_material": "defaultDetMaterial",
                        #
                        "position": [0, 0, 1],
                        "sizes": [1.5, 0.83, 0.05],
                        "rotation": [-3.4, 0, -4.5],
                    }, {"_name": "det3",
                        "_type": "BoxGeometry",
                        "_material": "defaultDetMaterial",
                        #
                        "position": [0, 0, 0],
                        "sizes": [1.4, 1.4, 0.05],
                        "rotation": [0, 0, 0],
                    },
                    # "reference track"
                    {   "_name": "referenceTrack",
                        "_type": "Line",
                        "_material": "referenceTrackMaterial",
                    }
                ]
            }

