from __future__ import annotations

import os

import pytest

from viewer_server.configfile import (
    ConfigError,
    apply_define,
    enabled_plugins,
    expand_string,
    load_config,
    plugin_section,
    server_section,
)


def test_expand_env_var_forms(monkeypatch):
    monkeypatch.setenv("VIEWER_TEST_VAR", "value")
    assert expand_string("$VIEWER_TEST_VAR") == "value"
    assert expand_string("${VIEWER_TEST_VAR}") == "value"
    assert expand_string("prefix-${VIEWER_TEST_VAR}-suffix") == "prefix-value-suffix"


def test_expand_unset_env_var_is_empty(monkeypatch):
    monkeypatch.delenv("VIEWER_TEST_UNSET", raising=False)
    assert expand_string("[$VIEWER_TEST_UNSET]") == "[]"


def test_expand_shell_command():
    assert expand_string("$(echo hi)") == "hi"


def test_expand_shell_command_failure_raises():
    with pytest.raises(ConfigError):
        expand_string("$(exit 3)")


def test_apply_define_creates_nested_path():
    config: dict = {}
    apply_define(config, "plugin.section.key=value")
    assert config == {"plugin": {"section": {"key": "value"}}}


def test_apply_define_overwrites_existing():
    config = {"a": {"b": "old"}}
    apply_define(config, "a.b=new")
    assert config == {"a": {"b": "new"}}


def test_apply_define_rejects_missing_equals():
    with pytest.raises(ConfigError):
        apply_define({}, "no-equals-sign")


def test_load_config_expands_and_overrides(tmp_path, monkeypatch):
    monkeypatch.setenv("VIEWER_TEST_DIR", "somedir")
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
server:
  host: 127.0.0.1
  port: 5000

plugins:
  - demo

demo:
  path: /data/$VIEWER_TEST_DIR
"""
    )
    config = load_config(config_path, ["demo.path=/override", "demo.extra=1"])

    assert server_section(config) == {"host": "127.0.0.1", "port": 5000}
    assert enabled_plugins(config) == ["demo"]
    assert plugin_section(config, "demo") == {"path": "/override", "extra": "1"}
    # a plugin id absent from the file yields an empty section, not an error
    assert plugin_section(config, "not-listed") == {}


def test_load_config_missing_file_raises(tmp_path):
    with pytest.raises(ConfigError):
        load_config(tmp_path / "does-not-exist.yaml")


def test_load_config_non_mapping_root_raises(tmp_path):
    config_path = tmp_path / "config.yaml"
    config_path.write_text("- just\n- a\n- list\n")
    with pytest.raises(ConfigError):
        load_config(config_path)


def test_enabled_plugins_requires_list(tmp_path):
    with pytest.raises(ConfigError):
        enabled_plugins({"plugins": {"not": "a list"}})
