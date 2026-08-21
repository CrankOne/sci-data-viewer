"""
YAML server configuration: loading, `$VAR`/`${VAR}`/`$(shell command)`
expansion, and CLI `-D` dotted-path overrides.

Config shape (see doc/plugins.rst for the full reference)::

    server:
      host: 127.0.0.1
      port: 5000
      debug: false
      cors: false
      plugin-load-strict: true

    plugins:
      - demo
      - na64umff

    demo:
      ...
    na64umff:
      results-dir: $NA64_DATA_DIR/results
      config-dump: $(find /data/umff -name config-dump.json)

``server`` holds the main server's own variables; ``plugins`` is the list
of installed plugin ids to load (an entry-point-discovered plugin not
named here is simply not loaded -- see ``ViewerPlugin`` contract docs for
why this list, rather than a plugin-declared default, decides
enablement); every other top-level key is a plugin id naming that
plugin's own config section, handed to its ``create_plugin(config)``
factory verbatim (after expansion/override below).
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any, Mapping, Sequence

import yaml


class ConfigError(RuntimeError):
    pass


_SHELL_CMD_RE = re.compile(r"\$\(([^()]*)\)")
_ENV_VAR_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)")


def _expand_shell_commands(value: str) -> str:
    def repl(match: re.Match) -> str:
        command = match.group(1)
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise ConfigError(
                f"Shell command {command!r} (from config) exited with "
                f"status {result.returncode}: {result.stderr.strip()}"
            )
        return result.stdout.rstrip("\n")

    return _SHELL_CMD_RE.sub(repl, value)


def _expand_env_vars(value: str) -> str:
    def repl(match: re.Match) -> str:
        name = match.group(1) or match.group(2)
        # Unset -> empty string, mirroring plain POSIX shell expansion
        # rather than failing the whole config over an optional variable.
        return os.environ.get(name, "")

    return _ENV_VAR_RE.sub(repl, value)


def expand_string(value: str) -> str:
    """
    Expands `$(shell command)` first, then `$VAR`/`${VAR}` environment
    references in what's left. A command's own output is not re-scanned
    for `$VAR` references -- if a command needs an environment variable,
    the shell it runs under already sees the real environment and can
    expand it itself.
    """
    return _expand_env_vars(_expand_shell_commands(value))


def _expand_tree(node: Any) -> Any:
    if isinstance(node, str):
        return expand_string(node)
    if isinstance(node, dict):
        return {key: _expand_tree(value) for key, value in node.items()}
    if isinstance(node, list):
        return [_expand_tree(item) for item in node]
    return node


def parse_define(raw: str) -> tuple[list[str], str]:
    """
    Parses one `-D` argument, `dotted.path.to.key=value`, into the key
    path (split on `.`) and the raw (unexpanded) value.
    """
    key, sep, value = raw.partition("=")
    key = key.strip()
    if not sep or not key:
        raise ConfigError(
            f"Invalid -D value {raw!r}, expected key.path=value"
        )
    return key.split("."), value


def apply_define(config: dict, raw: str) -> None:
    """
    Applies one `-D` override in place, creating intermediate mappings as
    needed. A path segment that currently holds a non-mapping value is
    overwritten with a fresh mapping rather than rejected -- `-D` is a
    blunt CLI override tool, not a schema-checked one.
    """
    path, value = parse_define(raw)
    node = config
    for segment in path[:-1]:
        child = node.get(segment)
        if not isinstance(child, dict):
            child = {}
            node[segment] = child
        node = child
    node[path[-1]] = value


def load_config(path: str | Path, defines: Sequence[str] = ()) -> dict[str, Any]:
    """
    Loads the YAML config at `path`, applies `defines` (`-D` overrides,
    applied to the raw tree before expansion so an override value is
    itself eligible for `$VAR`/`$(...)` expansion), then expands every
    string leaf.
    """
    path = Path(path)
    try:
        raw_text = path.read_text()
    except OSError as exc:
        raise ConfigError(f"Cannot read config file {path}: {exc}") from exc

    try:
        data = yaml.safe_load(raw_text)
    except yaml.YAMLError as exc:
        raise ConfigError(f"Cannot parse config file {path}: {exc}") from exc

    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ConfigError(
            f"Config file {path} must contain a YAML mapping at its top level"
        )

    for define in defines:
        apply_define(data, define)

    return _expand_tree(data)


def server_section(config: Mapping[str, Any]) -> Mapping[str, Any]:
    section = config.get("server", {})
    if not isinstance(section, dict):
        raise ConfigError("Config's 'server' section must be a mapping")
    return section


def enabled_plugins(config: Mapping[str, Any]) -> list[str]:
    plugins = config.get("plugins", [])
    if not isinstance(plugins, list):
        raise ConfigError("Config's 'plugins' section must be a list of plugin ids")
    return [str(item) for item in plugins]


def plugin_section(config: Mapping[str, Any], plugin_id: str) -> Mapping[str, Any]:
    section = config.get(plugin_id, {})
    if not isinstance(section, dict):
        raise ConfigError(f"Config section {plugin_id!r} must be a mapping")
    return section
