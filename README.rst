
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

