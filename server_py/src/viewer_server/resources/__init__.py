# viewer_server/resources/__init__.py

from __future__ import annotations
from collections.abc import Iterable
from flask_restful import Api
from ..plugins.contracts import ResourceDeclaration
from .scene import SceneResource

CORE_RESOURCES = (
    #ResourceDeclaration(
    #    resource=SceneResource,
    #    urls=("/scene",),
    #    endpoint="core.scene",
    #),
)

def register_resources(
    api: Api,
    declarations: Iterable[ResourceDeclaration],
) -> None:
    for declaration in declarations:
        kwargs = {}
        if declaration.endpoint is not None:
            kwargs["endpoint"] = declaration.endpoint
        api.add_resource(
            declaration.resource,
            *declaration.urls,
            **kwargs,
        )
