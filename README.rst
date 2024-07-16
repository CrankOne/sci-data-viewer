
3D Viewer SPA
-------------

Single page application (SPA) providing a somewhat generalized 3D viewer.

Development snippets
====================

Build client app (at the ``client/`` dir) with:

.. code-block:: shell

    $ yarn run build

Then run the server (Flask development, at the repo's root dir, perhaps you'll
need virtualenv with Flask, flask-restful, etc) with:

.. code-block:: shell

    $ python3 app.py

Then you should able to see something at ``http://127.0.0.1:5000/``.

Design Traits
=============

* a Flask application forwards output from various sources as an input to JS
  application in a form of certain "standard" objects
* JS SPA can navigate through the resources provided by Flask application,
  allowing one to "list" items

Example: a set of events read and processed by C++ application. Every event
generates a set of elementary objects (tracks, hit markers, etc). Those
objects, in a form of primitive JS objects are provided to JS app upon a GET
request on certain endpoint.

JS app combines items from arbitrary set of endpoints by the ``Resource``
abstraction.

* ``index.html`` -- provides main HTML page of an SPA
* ``settings.json`` -- provides settings object for SPA
* ``static/<file>`` -- provides static assets for the SPA
* ``resources/<resource-name>/`` -- supports at least GET view, interfaced as
  collection. Can be of three cases:
  #. Finite collection, with/without pagination, sort/querying via query
     string, etc
  #. Infinite collection, with at least forward iteration (backward may be
     or may be not supported), with optional indexing, etc
  #. Scalar object, returning same content
* ``resources/<resource-name>/<id>`` -- used for collection, returns a scalar
  object.

A scalar object should contain ``"materials"`` and ``"touchables"``.

* Material (in ``materials``), basically correspond to materials
  within ``THREE`` JS module. Provided object, excpet for ``_type``,
  ``_id`` and ``_hash`` attributes will be forwarded directly to
  constructor named as referenced by ``_type`` and can be referenced
  by touchables.
* Touchable (in ``"touchables"``):
  #. Line
  #. Lines
  #. Solid primitive
    * Box
    * Cone
    * Sphere
  #. Point
  #. Points
  #. Text label

Data Source Specification
=========================

Data source identified by its endpoint URI is expected to provide data in a
JSON format. Enpoint can be either a static view or iterable collection (finite,
infinite, with or without pagination).

Decision is made based on presense of following items in response object:

Has ``total``

Static Views
~~~~~~~~~~~~

Simple static views are considered to return arbitrary geometric data every
time ``GET`` request is fulfilled. Can be used for simple applications, to
look over the geometry update in real time. Besides ``geometryData`` attribute
providing the renderable geometry, a ``expiresIn`` time interval can be
returned indicating when the ``GET`` request should be dispatched next time,
to update the drawable geometry. Note, that user can disable automatic
updates.

Forward-iterable Collection
~~~~~~~~~~~~~~~~~~~~~~~~~~~

A ``GET`` request returns data similar to static view, but with ``iterable:true``
property without ``total`` in which case it is an indication that
``PATCH`` request with to same URL will switch endpoint to show next item in
the list. Upon last item of the list is reached, ``PATCH`` will
return ``304 (Not Modified)``.

Finite Collections
~~~~~~~~~~~~~~~~~~

In this case, at least ``<resource>/`` and ``<resource>/<id>`` endpoints are
expected. Upon requesting ``<resource>/`` we expect the returned object
contains:

#. Dense collection indexed with numbers from ``0`` to ``N`` (so, presence of all
items between ``0`` and ``N`` must be guaranteed):
  * ``total`` -- total number of items in collection
  * ``"_links": {"find": "url:str"}`` -- template URL string containing ``{id}``
    placeholder to get item by ID.
  * ``defaultID`` -- default item ID to show
#. Sparse collection with random access (and, optionally, pagination):
  * ``first`` -- first ID in collection
  * ``last`` -- last ID in collection
  * ``total`` -- total items in collection
  * ``items`` -- list of items -- all, or just for current page, if pagination
    is in use
  * ``{"_links": "url:str"}`` -- template URL string containing ``{id}``
    placeholder to get item by ID.
  * (pagination only) can have number of current page, encoded in query string
    parameter with ``page=<N:int>``
  * ``pages`` -- (pagination only) total number of pages
  * ``currentPage`` -- (pagination only) current page
    ID (``N`` of ``page=<N:int>`` if given or ``0``)

Access Model Decision
~~~~~~~~~~~~~~~~~~~~~

1. *Static view* -- if ``iterable`` is not provided or ``false``; ``expiresIn``
   steers whether periodic update is available
2. *FW-iterable collection* -- ``iterable=true`` and ``total`` is N/A.
3. *Dense collection* -- ``iterable=true``, ``total`` is valid number
   and ``items`` is N/A.
4. *Sparse collection without pagination* -- ``iterable=true``, ``total`` is
   valid, ``items`` is valid list, and ``pages`` is N/A.
5. *Sparse collection with pagination* -- ``iterable=true``, ``total`` is
   valid, ``items`` is valid list, and ``pages`` is valid list.


