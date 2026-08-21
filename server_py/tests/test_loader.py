from __future__ import annotations

import pytest

from viewer_server.plugins.loader import describe_plugins, load_plugins
from viewer_server.plugins.registry import PluginError


def test_describe_plugins_includes_demo():
    references = describe_plugins()
    ids = [ref.id for ref in references]
    assert "demo" in ids
    demo = next(ref for ref in references if ref.id == "demo")
    assert demo.error is None
    assert demo.params == ()


def test_load_plugins_only_loads_enabled():
    registry = load_plugins(enabled=["demo"], plugin_configs={})
    assert [p.id for p in registry.plugins] == ["demo"]


def test_load_plugins_empty_enabled_loads_nothing():
    registry = load_plugins(enabled=[])
    assert registry.plugins == ()


def test_load_plugins_unknown_id_raises():
    with pytest.raises(PluginError):
        load_plugins(enabled=["does-not-exist"])


def test_load_plugins_passes_plugin_config():
    # demo's create_plugin ignores its config argument, but the call must
    # not raise even with a non-empty section for it -- this is really a
    # regression guard on the enabled/plugin_configs wiring in load_plugins,
    # not on demo's own (trivial) behavior.
    registry = load_plugins(
        enabled=["demo"],
        plugin_configs={"demo": {"unused": "value"}},
    )
    assert [p.id for p in registry.plugins] == ["demo"]
