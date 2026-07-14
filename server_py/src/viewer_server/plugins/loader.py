"""
Plugin loader
"""

from __future__ import annotations
import logging
from importlib.metadata import EntryPoint, entry_points
from .contracts import ViewerPlugin
from .registry import PluginError, PluginRegistry


_LOG = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "sci_viewer_srv.plugins"

def load_plugins(
    *,
    strict: bool = True,
) -> PluginRegistry:
    registry = PluginRegistry()

    discovered = sorted(
        entry_points(group=ENTRY_POINT_GROUP),
        key=lambda ep: ep.name,
    )

    for entry_point in discovered:
        try:
            plugin = _load_plugin(entry_point)
            registry.add(plugin)
        except Exception:
            if strict:
                raise

            _LOG.exception(
                "Failed to load viewer plugin %s",
                entry_point.name,
            )

    return registry

def _load_plugin(entry_point: EntryPoint) -> ViewerPlugin:
    factory = entry_point.load()
    plugin = factory()

    if not isinstance(plugin, ViewerPlugin):
        raise PluginError(
            f"Entry point {entry_point.name!r} returned an object "
            "which does not match ViewerPlugin protocol"
        )

    if plugin.id != entry_point.name:
        raise PluginError(
            f"Plugin ID {plugin.id!r} does not match entry-point "
            f"name {entry_point.name!r}"
        )

    return plugin
