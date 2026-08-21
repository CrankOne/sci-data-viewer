WUI for Scientific Applications
-------------------------------

.. warning::
    Project is in a working prototype state. Interface and some major API
    may be heavily changed.

The goal of this project is to provide a generalized data viewer for
scientific applications, residing in the web browser and able to
communicate with (local or remote) server application by the means of HTTP
protocol.

Despite there are quite some tools well-developed tools on the market, this
project tries to cover a practically-important case when one form of
non-trivial data representation maps onto another form on a per-element basis.

For instance, having rather complex 3D geometry we want certain elements of it
to be mapped to a bulk tabular data. Another example is to associate complex
plots with the elements of the block diagram. While modern JS plotters offer
a plausible look and good interactivity means for the plots, inter-connecting
between them is often a nuisance still.

Usage Scenario
==============

This project is focused on applications that require sophisticated
visualization and allows decomposition of its data to collections. Common
examples are:

* tracking in high-energy physics
* spatial field visualizations
* non-stationary finite-difference differential-equations
* frame-based data analysis
* numerical model evaluation within complex multi-staged algorithms

The Project does not provide feature-rich sophisticated visualization tools by
itself, instead letting user to create their own representation layers and
benefit from plethora of JavaScript packages). The Project provides an
interfacing layer between low-level programs and JS code.

So, common use case implies that:

- an algorithm is capable to generate *items* within some *collection*. The
  Project covers certain common cases of these *collections*:
  * A paginated collection of items identified uniquely, by certain string ID,
    like events in high energy physics, number of frame in streamed video,
    number of iteration within the iterative algorithm, etc. Common for data
    residing in DBs.
  * finite or infinite (or very large) collection that can be iterated only
    forward (i.e. no random access by ID) -- common case of "full scan" app,
    or iterative algorithm where you would like to inspect data changes
    between the iterations.
  * Trivial case when collection consists from only one item (so no iteration
    is possible -- data just gets loaded and shown)
- every *item* can be represented by set of generic primitives (histograms,
  plots, 3D lines, geometrical primitives and so on) which can be addressed to
  particular component on a web page.

Having these restriction in mind, the *server* application exposes certain
HTTP enpoint(s) which client app can communicate.

Project provides a boilerplate code for Vue-based *client* single-page
application and some utility code for server-side Python (Flask) and/or C++
applications.

By customizing client SPA code user can extend presentation layer. Coping with
simplistic server-side boilerplate code, user can create their own specialized
applications.

Client SPA
==========

A client-side single page application uses Vue for components, Vuex for state
management and Vue-Router for state tracking. Coping with three.js a certain
degree of reactivity is reached.

Server Implementations
======================

Currently, two main options are available for extending the viewer application.
Both the Python and C++ servers shall expose the same externally visible
routes.

For static content

- ``GET /``
- ``GET /assets/{path}``
- ``GET /cdn/{path}``
- ``GET /{spa-route}``

REST resources:

- ``GET /scene``
- ...

C++ Server
~~~~~~~~~~

Project brings custom implementation of extremely lightweight *synchroneous*
HTTP server. This server is meant to be embedded in the user's iterative
algorithm and steer (in a single thread) or monitor (in a forked or threaded
mode) its execution. See examples in the ``server-cpp/`` directory.

Python (Flask) Server
~~~~~~~~~~~~~~~~~~~~~

For more complex scenarios with persistent storages (e.g. fetching data from
DB, distributed or delegated calculus) consider using a Python scripts within
the Python Flask server (see ``setver_py/``).

Misc Notes
----------

.. warning::

   Text below is some dev notes/spec drafts: this information can be imprecise
   or simply wrong and must not be used as a guidance.

Development snippets
====================

To run ``yarn`` it is sometimes better to use container environment (if you are
not intending to reguralry work with JS stuff), so build the image, run it and
keep the terminal for subsequent (re)builds:

.. code-block:: shell

   $ docker build . -t sciviewer
   $ docker run -v $(pwd):/var/src -ti sciviewer /bin/sh
   container $ cd /var/src/client
   container $ yarn run build

Run the server (Flask development, at the repo's root dir, perhaps you'll
need virtualenv with Flask, flask-restful from ``requirements.txt``, etc) with:

.. code-block:: shell

    $ source venv/bin/activate
    $ python3 -m pip install -e server_py
    $ cp server_py/config.example.yaml my-config.yaml   # then edit as needed
    $ sci-viewer-server --config my-config.yaml --debug

A YAML config file is mandatory (``server_py/config.example.yaml`` is a
starting point); it also lists which installed plugins to load and their
parameters -- run ``sci-viewer-server --list-plugins`` to see what's
installed, and see :doc:`doc/plugins` for the config file format.

Then you should able to see the viewer running at ``http://127.0.0.1:5000/``.

Data Source Specification
=========================

Data source identified by its endpoint URI is expected to provide data in a
JSON format. Only the *static view* access model below is currently
implemented end-to-end (server contract, client dispatch, and rendering).
Earlier drafts of this project also sketched out iterable/paginated
collection access models (forward-iterable, dense, sparse, sparse-with-
pagination); those were never fully implemented on the client side and the
corresponding stub components have been removed. The concept is still part
of the project's long-term direction (see `Usage Scenario`_ above), but the
access-model API itself needs to be re-designed against real use cases
before being reintroduced.

Static Views
~~~~~~~~~~~~

Simple static views are considered to return arbitrary geometric data every
time ``GET`` request is fulfilled. Can be used for simple applications, to
look over the geometry update in real time. Besides ``geometryData`` attribute
providing the renderable geometry, a ``expiresIn`` time interval can be
returned indicating when the ``GET`` request should be dispatched next time,
to update the drawable geometry. Note, that user can disable automatic
updates.

