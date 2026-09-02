# Project outline

The project folder contains client + server of an application facilitating
a viewer for scientific data. Key principles:

- UI: flexibility, precise and pixel-perfect plots, desktop-optimized condensed
  layout, and performance are the main priorities
- Generic app: the only subject-aware part of this software are the plugins
  installed to virtual env
- Besides of local extensions with plugins, it is possible to handle external
  data source endpoint by URL.

Do not be mislead by old "3dviewer" name, the viewer is designed to be generic,
the folder should be renamed later.

More subject-specific info is available in `doc/`; start from `doc/index.rst`.

# Conception of the client

Client is a Vue-based SPA with Vuex and router, build with `yarn`. Traits:

- Editable panel-based layout defines 1st level tree of widgets
- Extensible with "modules" (static items, compiled-in)
- A panel can a) contain a module view, b) provide columnar layout for
  "subpanels", c) (rarely) have a special sole-purposed widget (wiring editor)
- Has persistency for sessions: layout and certain other UI states are saved
  on local storage, can be imported and exported
- Router should facilitate referencing items from random access data sources
  so that users can exchange links to 1st-level selection (fetched from data
  sources). When source does not exist in the session opened, it is quietly
  ignored
- Data flow can be dynamically (re)arranged: data sources provide initial input,
  "modules" consuming data can have output wired to another modules, based on
  selection
- Modules expect server to provide *minimalistic* vocabulary of data types --
  generic primitives for plotters, nodes and edges, agnostic to the particular
  subject field.

# Conception of the server

Server is a Flask app, *usually* running at 127.0.0.1:5000 at the time I ask for
changes.

- Each data source exposes RESTful interface with well-defined protocol
- Can be queried for API version, installed plugins
- Can manage iterable sequences of data, with optional support for random
  access by ID

# Note on plugins

Info on the active plugins and important note on the abstraction layers
separation regarding application-specific extensions can be found
in `doc/current-plugins.rst`.

