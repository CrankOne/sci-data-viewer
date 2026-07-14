from __future__ import annotations
import mimetypes
from typing import Any, Mapping
from flask import Flask, abort, send_from_directory
from flask_cors import CORS
from flask_restful import Api

# Base
from .paths import ViewerPaths, discover_paths
from .resources import register_resources, CORE_RESOURCES
# Plugins system
from .plugins.loader import load_plugins
from .plugins.routes import blueprint as plugins_blueprint
from .resources import register_resources

# Some systems have incomplete or incorrect MIME databases.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("font/woff2", ".woff2")

def _check_runtime_paths(paths: ViewerPaths) -> None:
    required = (
        paths.clientDist / "index.html",
        paths.clientAssets,
        paths.miscStatic,
    )
    missing = [path for path in required if not path.exists()]
    if missing:
        formatted = "\n".join(f"  - {path}" for path in missing)
        raise RuntimeError(
            "Viewer runtime assets are missing:\n"
            f"{formatted}\n"
            "Run the client build or set VIEWER_DATA_DIR."
        )

def create_app(
    config: Mapping[str, Any] | None = None,
    *,
    paths: ViewerPaths | None = None,
) -> Flask:
    runtime_paths = paths or discover_paths()
    _check_runtime_paths(runtime_paths)

    # Disable Flask's implicit static handler. Shared assets are exposed
    # through explicit routes which the C++ server can reproduce exactly.
    app = Flask(__name__, static_folder=None)
    app.config.from_object("viewer_server.config.DefaultConfig")
    if config is not None:
        app.config.from_mapping(config)
    if app.config["ENABLE_CORS"]:
        CORS(
            app,
            resources={
                r"/scene": {"origins": "*"},
                r"/api/*": {"origins": "*"},
            },
        )
    api = Api(app)
    register_resources(api, CORE_RESOURCES)

    registry = load_plugins(strict=app.config.get("PLUGIN_LOAD_STRICT", True))
    app.extensions["viewer_plugins"] = registry
    app.register_blueprint(plugins_blueprint)
    for plugin in registry.plugins:
        register_resources(api, plugin.resources())
        for blueprint in plugin.blueprints():
            app.register_blueprint(blueprint)

    register_static_routes(app, runtime_paths)
    return app

def register_static_routes(
    app: Flask,
    paths: ViewerPaths,
) -> None:
    @app.get("/")
    def index_view():
        return send_from_directory(
            paths.clientDist,
            "index.html",
        )

    @app.get("/assets/<path:filename>")
    def client_asset(filename: str):
        return send_from_directory(
            paths.clientAssets,
            filename,
        )

    @app.get("/cdn/<path:filename>")
    def misc_static(filename: str):
        return send_from_directory(
            paths.miscStatic,
            filename,
        )

    # Support history-mode SPA routes (Vue Router uses them)
    # Prevent API-like paths from silently receiving index.html.
    @app.get("/<path:path>")
    def spa_fallback(path: str):
        candidate = paths.clientDist / path

        if candidate.is_file():
            return send_from_directory(
                paths.clientDist,
                path,
            )

        if path.startswith(("api/", "scene", "cdn/", "assets/")):
            abort(404)

        return send_from_directory(
            paths.clientDist,
            "index.html",
        )
