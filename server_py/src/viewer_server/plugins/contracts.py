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
from typing import (
    Any, Callable, Literal, Mapping, Protocol, Sequence, TypeAlias,
    runtime_checkable,
)
from flask import Blueprint
from flask_restful import Resource

QueryOptionType: TypeAlias = Literal["boolean", "integer", "number", "string"]

@dataclass(frozen=True)
class DataSourceDeclaration:
    """
    A predefined data-source descriptor endpoint.

    ``url`` is either a Flask endpoint name local to this server (resolved
    via ``url_for`` when the plugin manifest is built), or an absolute URL
    (``scheme://...``), used as-is. The latter lets a plugin register a
    3rd-party source that implements the REST contract from
    ``doc/sources.rst`` on its own, without a local proxy route -- see
    "Cross-origin sources" there for what that source must additionally
    provide (CORS headers) to be reachable from a browser client.
    """
    id: str
    url: str
    label: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResolverDeclaration:
    """
    A resolver capable of providing associated data for the objects picked
    on the scene for a detailed inspection.

    ``url`` MUST point to an endpoint implementing the *addressable* data
    source interface from ``doc/sources.rst``, with ``collection.enumerable``
    set to ``true``: the picked object's stable identifier is used as the
    ``{id}`` in ``GET {url}/{id}``, and ``GET {url}`` MUST enumerate the
    identifiers the resolver can currently resolve. Use
    :func:`enumerable_resolver_descriptor` to build the JSON document
    returned by that endpoint. As with ``DataSourceDeclaration.url``, this
    MAY be an absolute URL pointing at a 3rd-party resolver.
    """

    id: str
    url: str
    label: str | None = None
    supported_types: tuple[str, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CollectionCapabilities:
    """
    Mirrors the ``collection`` object of an addressable source descriptor
    (doc/sources.rst, "Addressable capability").
    """

    enumerable: bool
    finite: bool = True
    pagination: bool = False
    page_size: int | None = None
    max_page_size: int | None = None

    def to_json(self) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "finite": self.finite,
            "enumerable": self.enumerable,
            "pagination": self.pagination,
        }
        if self.pagination:
            if self.page_size is not None:
                doc["page-size"] = self.page_size
            if self.max_page_size is not None:
                doc["max-page-size"] = self.max_page_size
        return doc


@dataclass(frozen=True)
class QueryOptionSchema:
    """
    Describes one query-string option accepted by a source's data-fetch
    endpoint (the ``data-url`` from the descriptor). Advertised so a client
    can render a matching form control and append the option to the request
    without any source-specific client code.

    Intentionally a tiny subset of the OpenAPI Parameter Object
    (https://swagger.io/specification/#parameter-object) -- ``name``,
    ``description``, ``required`` sit at the top level, and the value
    constraints sit under ``schema``, mirroring that shape closely enough
    that a client (or tooling) already familiar with OpenAPI/JSON Schema can
    read it directly.
    """

    name: str
    type: QueryOptionType
    description: str | None = None
    required: bool = False
    default: Any = None
    minimum: float | None = None
    maximum: float | None = None
    # Allowed values; only meaningful (and only emitted) for type == "string".
    enum: Sequence[str] | None = None

    def __post_init__(self) -> None:
        if self.enum is not None and self.type != "string":
            raise ValueError("enum is only supported for type \"string\"")
        if (self.minimum is not None or self.maximum is not None) \
        and self.type not in ("integer", "number"):
            raise ValueError("minimum/maximum only apply to numeric types")

    def to_json(self) -> dict[str, Any]:
        schema: dict[str, Any] = {"type": self.type}
        if self.default is not None:
            schema["default"] = self.default
        if self.minimum is not None:
            schema["minimum"] = self.minimum
        if self.maximum is not None:
            schema["maximum"] = self.maximum
        if self.enum is not None:
            schema["enum"] = list(self.enum)
        doc: dict[str, Any] = {
            "name": self.name,
            "in": "query",
            "required": self.required,
            "schema": schema,
        }
        if self.description is not None:
            doc["description"] = self.description
        return doc


@dataclass(frozen=True)
class SourceDescriptor:
    """
    Builds a data source descriptor document as defined by the Data Source
    REST Interface (doc/sources.rst). Serve the result of :meth:`to_json`
    from the endpoint referenced by ``DataSourceDeclaration.url`` /
    ``ResolverDeclaration.url``.
    """

    data_url: str
    sequential: bool = False
    addressable: bool = False
    collection: CollectionCapabilities | None = None
    # query-string options accepted by `data_url` (see QueryOptionSchema)
    query_options: Sequence[QueryOptionSchema] = field(default_factory=tuple)
    # source-specific properties the spec permits in addition to the
    # standard ones, e.g. {"type": "geo3d"}
    extra: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.collection is not None and not self.addressable:
            raise ValueError(
                "collection capabilities require addressable=True"
            )

    def to_json(self) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "data-url": self.data_url,
            "sequential": self.sequential,
            "addressable": self.addressable,
        }
        if self.collection is not None:
            doc["collection"] = self.collection.to_json()
        if self.query_options:
            doc["query-options"] = [opt.to_json() for opt in self.query_options]
        doc.update(self.extra)
        return doc


def enumerable_resolver_descriptor(
    data_url: str,
    *,
    finite: bool = True,
    pagination: bool = False,
    page_size: int | None = None,
    max_page_size: int | None = None,
    **extra: Any,
) -> SourceDescriptor:
    """
    Builds the descriptor a resolver's endpoint MUST return.

    A resolver is addressable by picked-object id and enumerable over that
    id space (see :class:`ResolverDeclaration`), so ``addressable`` and
    ``collection.enumerable`` are fixed to ``True``.
    """
    return SourceDescriptor(
        data_url=data_url,
        addressable=True,
        collection=CollectionCapabilities(
            enumerable=True,
            finite=finite,
            pagination=pagination,
            page_size=page_size,
            max_page_size=max_page_size,
        ),
        extra=extra,
    )


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

PluginParamType: TypeAlias = Literal["string", "integer", "number", "boolean"]

@dataclass(frozen=True)
class PluginParamSchema:
    """
    Describes one configuration parameter a plugin's ``create_plugin``
    factory reads from its own section of the server's YAML config file
    (``doc/plugins.rst``). Purely descriptive -- nothing here is enforced
    against the actual config mapping a factory receives; it only backs
    ``sci-viewer-server --list-plugins`` and the ``-D`` override
    reference, so a config mistake is easy to spot instead of failing
    silently with a wrong default.
    """

    name: str
    type: PluginParamType = "string"
    description: str | None = None
    default: Any = None
    required: bool = False

    def to_json(self) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
            "required": self.required,
        }
        if self.description is not None:
            doc["description"] = self.description
        if self.default is not None:
            doc["default"] = self.default
        return doc


PluginConfig: TypeAlias = Mapping[str, Any]


def plugin_params(*schemas: PluginParamSchema) -> Callable[[Callable], Callable]:
    """
    Decorator attaching a static config-parameter schema to a plugin's
    entry-point factory (conventionally named ``create_plugin``), so
    ``--list-plugins`` can describe a plugin's parameters without calling
    the factory -- which needs real config values a bare listing has
    none of, and may fail for reasons unrelated to listing (e.g. a
    missing optional dependency a plugin otherwise degrades gracefully
    without, see al_albrw.py's tracks/hits source).

    Usage::

        @plugin_params(
            PluginParamSchema(name="results-dir", description="..."),
        )
        def create_plugin(config: PluginConfig) -> ViewerPlugin:
            ...
    """

    def decorator(factory: Callable) -> Callable:
        factory.params = schemas  # type: ignore[attr-defined]
        return factory

    return decorator


@runtime_checkable
class ViewerPlugin(Protocol):
    """
    Contract implemented by installed viewer-server plugins.

    The registered entry point (group ``sci_viewer_srv.plugins``) does
    not point at a ``ViewerPlugin`` directly but at a *factory* --
    conventionally named ``create_plugin`` -- called as
    ``create_plugin(config: PluginConfig) -> ViewerPlugin``, where
    ``config`` is that plugin's own section of the server's YAML config
    file (an empty mapping if the section is absent). This replaces
    reading ``os.environ`` directly for plugin parameterization; see
    ``doc/plugins.rst``. Optionally decorate the factory with
    ``@plugin_params(...)`` to advertise its parameters for
    ``--list-plugins``.
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
