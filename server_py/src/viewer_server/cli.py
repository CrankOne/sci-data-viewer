from __future__ import annotations
import argparse
import sys
from .app import create_app
from .configfile import ConfigError, enabled_plugins, load_config, plugin_section, server_section
from .plugins.loader import PluginReference, describe_plugins
from .plugins.registry import PluginError


def _format_plugin_reference(ref: PluginReference) -> list[str]:
    lines = [f"  {ref.id}"]
    if ref.error is not None:
        lines.append(f"    ! failed to import: {ref.error}")
        return lines
    if not ref.params:
        lines.append("    (no configurable parameters)")
        return lines
    for param in ref.params:
        flags = []
        if param.required:
            flags.append("required")
        if param.default is not None:
            flags.append(f"default: {param.default!r}")
        suffix = f"  ({', '.join(flags)})" if flags else ""
        lines.append(f"    {param.name} <{param.type}>{suffix}")
        if param.description:
            lines.append(f"        {param.description}")
    return lines

def format_plugins_reference() -> str:
    references = describe_plugins()
    lines = ["Installed viewer-server plugins:", ""]
    if not references:
        lines.append("  (none installed)")
    for ref in references:
        lines.extend(_format_plugin_reference(ref))
        lines.append("")
    lines.append(
        "Enable a plugin by listing its id under the config file's "
        "top-level 'plugins:' section; override one of its parameters "
        "from the command line with -D<plugin-id>.<param>=<value>."
    )
    return "\n".join(lines)

def main() -> None:
    parser = argparse.ArgumentParser(
            description="Run the Python scientific viewer server.",
        )

    parser.add_argument( "--config",
            metavar="PATH",
            help="Path to the server's YAML config file. Required to run "
                 "the server (not required with --list-plugins).",
        )
    parser.add_argument( "--list-plugins",
            action="store_true",
            help="List installed plugins and their configurable parameters, then exit.",
        )
    parser.add_argument( "-D",
            dest="defines",
            action="append",
            default=[],
            metavar="KEY.PATH=VALUE",
            help="Override a config value, e.g. -Dna64umff.results-dir=/data/results. "
                 "May be given multiple times.",
        )
    parser.add_argument( "--host",
            default=None,
            help="Overrides the config file's server.host.",
        )
    parser.add_argument( "--port",
            type=int,
            default=None,
            help="Overrides the config file's server.port.",
        )
    parser.add_argument( "--debug",
            action="store_true",
            default=None,
        )
    parser.add_argument( "--cors",
            action="store_true",
            default=None,
            help="Enable CORS for API routes.",
        )

    args = parser.parse_args()

    if args.list_plugins:
        print(format_plugins_reference())
        return

    if not args.config:
        parser.error("the following arguments are required: --config "
                      "(unless --list-plugins is given)")

    try:
        raw_config = load_config(args.config, args.defines)
        server = server_section(raw_config)
        plugins = enabled_plugins(raw_config)
        plugin_configs = {name: plugin_section(raw_config, name) for name in plugins}
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)

    debug = args.debug if args.debug is not None else bool(server.get("debug", False))
    cors = args.cors if args.cors is not None else bool(server.get("cors", False))
    host = args.host if args.host is not None else server.get("host", "127.0.0.1")
    port = args.port if args.port is not None else int(server.get("port", 5000))

    try:
        app = create_app({
                "DEBUG": debug,
                "ENABLE_CORS": cors,
                "PLUGIN_LOAD_STRICT": bool(server.get("plugin-load-strict", True)),
                "PLUGINS_ENABLED": plugins,
                "PLUGIN_CONFIGS": plugin_configs,
            })
    except PluginError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)

    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
