"""
A Flask Blueprint referencing known data sources, resolvers, client
extensions, etc. Note, that in the client is still possible to
add external ones.
"""

from __future__ import annotations
from dataclasses import asdict
from urllib.parse import urlsplit
from flask import Blueprint, current_app, jsonify, url_for

blueprint = Blueprint(
    "viewer_plugins",
    __name__,
    url_prefix="/api/plugins",
)

@blueprint.get("")
def plugin_manifest():
    registry = current_app.extensions["viewer_plugins"]

    r = {
        "dataSources": [
            asdict(source)
            for source in registry.dataSources
        ],
        "resolvers": [
            asdict(resolver)
            for resolver in registry.resolvers
        ],
        "clientExtensions": [
            asdict(extension)
            for extension in registry.clientExtensions
        ],
    }

    attrsToBeResolvedAsURLs = [
              ('dataSources', 'url', {'_external': True})
            , ('resolvers', 'url', {})]
    for k, att, kwargs in attrsToBeResolvedAsURLs:
        for item in r[k]:
            if att not in item or not item[att]: continue
            if urlsplit(item[att]).scheme:
                # already an absolute URL (e.g. a 3rd-party source) --
                # used as-is, not a local Flask endpoint name
                continue
            item[att] = url_for(item[att], **kwargs)

    return jsonify(r)
