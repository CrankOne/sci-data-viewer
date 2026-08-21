:orphan:

Plugin contracts
=================

.. warning::
   Draft, and deliberately brief -- the plugin contract surface
   (``server_py/src/viewer_server/plugins/contracts.py``) is still actively
   changing. Treat this page as a pointer into the code, not a stable
   specification, until it settles enough to find its proper place in the
   documentation tree (see :doc:`index`) -- most likely a "plugins guide"
   alongside a laconic how-to for writing one.

A **plugin** is server-side: an installed Python package registering an
entry point under the ``sci_viewer_srv.plugins`` group, whose target is a
*factory* -- conventionally named ``create_plugin`` -- returning an object
implementing the ``ViewerPlugin`` protocol (``viewer_server/plugins/
contracts.py``). Loaded plugins are collected into a single
``PluginRegistry``. This is a distinct extension mechanism from a viewer
*module* (statically compiled into the client, :doc:`ui-session`'s
"Extension points") and from a runtime *data source* (an instance of data
a module renders, added by URL at runtime, :doc:`sources`) -- a plugin is
what *contributes* data sources, and optionally more, at server startup.

Configuration
-------------

The server takes a single mandatory ``--config`` argument, a YAML file::

    server:
      host: 127.0.0.1
      port: 5000
      debug: false
      cors: false
      plugin-load-strict: true

    plugins:
      - demo
      - na64umff

    demo: {}

    na64umff:
      results-dir: $NA64_DATA_DIR/results
      config-dump: $(find /data/umff -maxdepth 1 -name config-dump.json)

``server`` holds the server's own variables. ``plugins`` is the list of
*installed* (entry-point-discovered) plugin ids to actually load --
run ``sci-viewer-server --list-plugins`` to see what's installed and each
plugin's configurable parameters without needing a config file at all. A
plugin not named here is simply never loaded, even if installed; a name
listed here that isn't installed is a hard startup error. This
enabled/disabled decision lives entirely in the config file -- it is
*not* a property a plugin declares about itself (there is deliberately no
"enabled by default" flag anywhere in the ``ViewerPlugin``/factory
contract).

Every other top-level key is a plugin id naming that plugin's own config
section, a plain mapping passed to its factory verbatim (an empty mapping
if the plugin has no section, e.g. ``demo`` above). Parameter names
within a plugin's section are kebab-case (``results-dir``, not
``results_dir``), matching this codebase's existing convention for
wire-facing keys (``data-url``, ``page-size``, etc. in
:doc:`sources`) -- not Python's own snake_case.

String values anywhere in the file may reference an environment variable
(``$VAR`` or ``${VAR}``, expanding to an empty string if unset) or shell
command output (``$(command)``, run via the shell; a non-zero exit fails
startup) -- see ``viewer_server/configfile.py``. This replaces reading
``os.environ`` directly from inside a plugin for its own parameterization
-- do that through a config parameter instead (see below).

Any value, in any section, can be overridden from the command line with
``-D``, e.g.::

    sci-viewer-server --config server.yaml -Dna64umff.results-dir=/data/results

``-D`` takes a dotted path into the config tree and a raw string value,
applied (and then expanded, same as the file's own values) before the
config is otherwise used. ``--host``/``--port``/``--debug``/``--cors``
remain as direct CLI overrides of ``server.*`` for convenience; ``-D`` is
the general mechanism, and the only one plugin sections have.

Writing a plugin
-----------------

A plugin's entry point points at a factory function::

    from viewer_server.plugins.contracts import (
        PluginConfig, PluginParamSchema, plugin_params,
    )

    @plugin_params(
        PluginParamSchema(
            name="results-dir",
            description="Directory of per-event results dumps.",
            default="/some/bundled/fixture",
        ),
    )
    def create_plugin(config: PluginConfig) -> MyViewerPlugin:
        # config is this plugin's own section of the server's YAML
        # config file (see above) -- an empty mapping if that section
        # is absent. Read parameters from it, not from os.environ.
        results_dir = config.get("results-dir", "/some/bundled/fixture")
        ...
        return MyViewerPlugin(results_dir)

``@plugin_params(...)`` is optional but recommended: it attaches a static
schema to the factory (read, never called) so ``--list-plugins`` can
describe a plugin's parameters even when the factory itself would fail
without real config or a real environment (missing optional dependency,
unreachable data directory, etc). A plugin with no parameters should
still apply ``@plugin_params()`` with no arguments, so ``--list-plugins``
reports "no configurable parameters" explicitly rather than omitting the
plugin's schema entirely.

If a plugin's route handlers need config-derived state (a directory to
search, a format to parse), the common pattern here is a module-level
variable the factory sets before returning -- Flask blueprints are
defined once at module scope and route handlers are plain view functions
closing over module globals, not methods on the plugin instance, so this
keeps the config's effect visible to them without restructuring the
whole blueprint. See ``na64umff.py``'s ``gResultsDir``/``gConfigDumpPath``
or ``al_albrw_config.py``'s ``configure()`` for two variations on this.
A corollary: nothing importing a plugin's module (including
``--list-plugins``, and the entry-point's own ``.load()``) should do real
work -- read files, hit the network, construct expensive state -- at
*module* import time; defer that into the factory (or further, into a
route handler, if it should only happen per-request). ``al_albrw.py``'s
lazy, try/except-guarded import of its tracks/hits source (whose
registration used to read ``detectors.dat`` at import time) is the
concrete example of this being fixed.

``ViewerPlugin`` declares four kinds of contribution, each a sequence of
small frozen dataclasses:

``data_sources() -> DataSourceDeclaration``
    A predefined source, exposed at startup. Its ``url`` is either a local
    Flask endpoint or an absolute URL to a 3rd-party source implementing
    :doc:`sources` on its own. There's no "enabled by default" flag on a
    declared source either (:doc:`ui-session` used to auto-seed a new
    client session with these; removed -- see its "Data sources:
    restoration" section) -- a session's sources are always added
    interactively, or restored from what was already attached.

``resolvers() -> ResolverDeclaration``
    An addressable+enumerable :doc:`sources`-conformant endpoint resolving
    "associated data for objects picked on the scene, for detailed
    inspection" -- declared here but not yet consumed client-side, see
    :doc:`module-3d-viewer`'s "Cross-module interaction".

``client_extensions() -> ClientExtensionDeclaration``
    A pre-built ES module the client could load at runtime -- likewise
    declared with no client-side loader yet.

``resources() -> ResourceDeclaration``
    Raw Flask-RESTful resources (class + URL rules) a plugin wants mounted
    directly, bypassing the declarative source/resolver shape above.

Every contributed id must be globally unique (``PluginRegistry`` rejects
duplicates on insertion); the convention is a qualified name, e.g.
``na64.live-event`` or ``core.showroom``. The registry backs the
``GET /api/plugins`` manifest (``plugins/routes.py``) that :doc:`ui-session`'s
default-source seeding and "Known source" picker both read.
