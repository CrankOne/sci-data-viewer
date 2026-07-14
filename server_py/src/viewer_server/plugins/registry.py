"""
Implements plugin registry.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from .contracts import (
    ClientExtensionDeclaration,
    DataSourceDeclaration,
    ResolverDeclaration,
    ViewerPlugin,
)

class PluginError(RuntimeError):
    pass

@dataclass
class PluginRegistry:
    # plugins by their self-reported ID
    _plugins: dict[str, ViewerPlugin] = field(default_factory=dict)
    # data sources by their self-reported ID
    _dataSources: dict[str, DataSourceDeclaration] = field(
        default_factory=dict
    )
    # resolvers by their self-reported ID
    _resolvers: dict[str, ResolverDeclaration] = field(
        default_factory=dict
    )
    # client extensions by their self-reported ID
    _clientExtensions: dict[str, ClientExtensionDeclaration] = field(
        default_factory=dict
    )

    def add(self, plugin: ViewerPlugin) -> None:
        """
        Registers a plugin.
        """
        # add a plugin
        if plugin.id in self._plugins:
            raise PluginError(
                f"Duplicate viewer plugin ID: {plugin.id!r}"
            )
        self._plugins[plugin.id] = plugin
        # add plugin's sources
        for source in plugin.data_sources():
            self._insert_unique(
                self._dataSources,
                source.id,
                source,
                "data source",
                plugin.id,
            )
        # add plugin's data resolvers
        for resolver in plugin.resolvers():
            self._insert_unique(
                self._resolvers,
                resolver.id,
                resolver,
                "resolver",
                plugin.id,
            )
        # add plugin's client extensions
        for extension in plugin.client_extensions():
            self._insert_unique(
                self._clientExtensions,
                extension.id,
                extension,
                "client extension",
                plugin.id,
            )

    @staticmethod
    def _insert_unique(
        destination: dict,
        object_id: str,
        value: object,
        kind: str,
        plugin_id: str,
    ) -> None:
        if object_id in destination:
            raise PluginError(
                f"Duplicate {kind} ID {object_id!r}, "
                f"contributed by plugin {plugin_id!r}"
            )

        destination[object_id] = value

    @property
    def plugins(self) -> tuple[ViewerPlugin, ...]:
        """
        Registered plugins
        """
        return tuple(self._plugins.values())

    @property
    def dataSources(self) -> tuple[DataSourceDeclaration, ...]:
        """
        Known data sources
        """
        return tuple(self._dataSources.values())

    @property
    def resolvers(self) -> tuple[ResolverDeclaration, ...]:
        """
        Known data resolvers
        """
        return tuple(self._resolvers.values())

    @property
    def clientExtensions(
        self,
    ) -> tuple[ClientExtensionDeclaration, ...]:
        """
        Known client extensions
        """
        return tuple(self._clientExtensions.values())
