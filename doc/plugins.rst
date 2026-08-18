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

A **plugin** is server-side: an installed Python object implementing the
``ViewerPlugin`` protocol (``viewer_server/plugins/contracts.py``),
registered into a single ``PluginRegistry``. It is a distinct extension
mechanism from a viewer *module* (statically compiled into the client,
:doc:`ui-session`'s "Extension points") and from a runtime *data source* (an
instance of data a module renders, added by URL at runtime, :doc:`sources`)
-- a plugin is what *contributes* data sources, and optionally more, at
server startup.

``ViewerPlugin`` declares four kinds of contribution, each a sequence of
small frozen dataclasses:

``data_sources() -> DataSourceDeclaration``
    A predefined source, exposed at startup. Its ``url`` is either a local
    Flask endpoint or an absolute URL to a 3rd-party source implementing
    :doc:`sources` on its own. ``enabledByDefault`` feeds :doc:`ui-session`'s
    new-session default-source seeding.

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
