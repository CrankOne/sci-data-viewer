"""
A Flask Blueprint referencing known data sources, resolvers, client
extensions, etc. Note, that in the client is still possible to
add external ones.
"""

from __future__ import annotations
from dataclasses import asdict
from importlib.metadata import entry_points, version as dist_version
from urllib.parse import urlsplit
from flask import Blueprint, current_app, jsonify, url_for

from .loader import ENTRY_POINT_GROUP

# This server's own installed distribution name (server_py/pyproject.toml's
# [project] name) -- used to report its version alongside the loaded
# plugins' own (see plugin_manifest()).
SERVER_DIST_NAME = "sci-viewer-server"

blueprint = Blueprint(
    "viewer_plugins",
    __name__,
    url_prefix="/api/plugins",
)

@blueprint.get("")
def plugin_manifest():
    registry = current_app.extensions["viewer_plugins"]

    # Each loaded plugin's own installed-distribution version, keyed by its
    # id -- entry points and distributions are re-discovered here rather
    # than threaded through the registry, since this is purely informational
    # (client/src/components/AppControls.vue) and not otherwise needed post-
    # load.
    dists = {ep.name: ep.dist for ep in entry_points(group=ENTRY_POINT_GROUP)}

    r = {
        "serverVersion": dist_version(SERVER_DIST_NAME),
        "plugins": [
            {
                "id": plugin.id,
                "version": dists[plugin.id].version if dists.get(plugin.id) else None,
            }
            for plugin in registry.plugins
        ],
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
