"""
Defines constracts for back-end plugins providing embedded data sources for
viewer app.

Note: IDs should be globally unique. Prefer qualified names:
    core.showroom
    na64.live-event
    na64.detector-geometry
    edm4hep.collection
    cern-cms.inner-tracker-geometry
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol, Sequence, TypeAlias, runtime_checkable
from flask import Blueprint
from flask_restful import Resource

@dataclass(frozen=True)
class DataSourceDeclaration:
    """
    A predefined data-source descriptor endpoint.
    """
    id: str
    url: str
    label: str | None = None
    enabledByDefault: bool = False
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResolverDeclaration:
    """
    A resolver capable of providing associated data for the objects picked
    on the scene for a detailed inspection.
    """

    id: str
    url: str
    label: str | None = None
    supported_types: tuple[str, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ClientExtensionDeclaration:
    """
    A pre-built JavaScript extension served as an ES module.
    """

    id: str
    module_url: str
    metadata: Mapping[str, Any] = field(default_factory=dict)


ResourceClass: TypeAlias = type[Resource]

@dataclass(frozen=True)
class ResourceDeclaration:
    resource: ResourceClass
    urls: tuple[str, ...]
    endpoint: str | None = None

@runtime_checkable
class ViewerPlugin(Protocol):
    """
    Contract implemented by installed viewer-server plugins.
    """

    @property
    def id(self) -> str:
        ...

    def blueprints(self) -> Sequence[Blueprint]:
        """
        Return Flask blueprints contributed by the plugin.
        """
        ...

    def data_sources(self) -> Sequence[DataSourceDeclaration]:
        ...

    def resolvers(self) -> Sequence[ResolverDeclaration]:
        ...

    def client_extensions(self) -> Sequence[ClientExtensionDeclaration]:
        ...

    def resources(self) -> Sequence[ResourceDeclaration]:
        ...
