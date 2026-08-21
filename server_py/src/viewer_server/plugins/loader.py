"""
Plugin loader
"""

from __future__ import annotations
import logging
from dataclasses import dataclass, field
from importlib.metadata import EntryPoint, entry_points
from typing import Any, Mapping, Sequence
from .contracts import PluginParamSchema, ViewerPlugin
from .registry import PluginError, PluginRegistry


_LOG = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "sci_viewer_srv.plugins"


def _discover() -> list[EntryPoint]:
    return sorted(entry_points(group=ENTRY_POINT_GROUP), key=lambda ep: ep.name)


def load_plugins(
    *,
    enabled: Sequence[str] = (),
    plugin_configs: Mapping[str, Mapping[str, Any]] = {},
    strict: bool = True,
) -> PluginRegistry:
    """
    Loads exactly the plugins named in `enabled` (the config file's
    top-level `plugins` list -- see configfile.py) among those installed
    under ENTRY_POINT_GROUP, each with its own section of `plugin_configs`
    (empty mapping if that plugin has no section). An installed-but-not-
    enabled plugin is never loaded; an enabled-but-not-installed name is
    always a hard config error, regardless of `strict` (that's a
    misconfiguration to fix, not a flaky plugin to skip).
    """
    registry = PluginRegistry()
    discovered = {ep.name: ep for ep in _discover()}

    missing = [name for name in enabled if name not in discovered]
    if missing:
        raise PluginError(
            "Config enables plugin(s) not found among installed entry "
            f"points ({ENTRY_POINT_GROUP!r}): {', '.join(sorted(missing))}"
        )

    for name in enabled:
        entry_point = discovered[name]
        try:
            plugin = _load_plugin(entry_point, plugin_configs.get(name, {}))
            registry.add(plugin)
        except Exception:
            if strict:
                raise

            _LOG.exception(
                "Failed to load viewer plugin %s",
                name,
            )

    return registry

def _load_plugin(entry_point: EntryPoint, config: Mapping[str, Any]) -> ViewerPlugin:
    factory = entry_point.load()
    plugin = factory(config)

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


@dataclass(frozen=True)
class PluginReference:
    """
    Describes one installed plugin for `--list-plugins`, independent of
    whether any config actually enables it.
    """

    id: str
    params: tuple[PluginParamSchema, ...] = field(default_factory=tuple)
    error: str | None = None


def describe_plugins() -> list[PluginReference]:
    """
    Describes every plugin installed under ENTRY_POINT_GROUP: its id and
    declared config parameters (see `plugin_params`). Never calls the
    factory (only imports the entry point's module) -- a listing has no
    real config to call it with, and a plugin's own import is expected to
    be cheap/side-effect-free (heavier, config-dependent or fallible work
    belongs in the factory, not at module import time).
    """
    references = []
    for entry_point in _discover():
        try:
            factory = entry_point.load()
        except Exception as exc:
            references.append(PluginReference(id=entry_point.name, error=str(exc)))
            continue

        params = tuple(getattr(factory, "params", ()))
        references.append(PluginReference(id=entry_point.name, params=params))

    return references
