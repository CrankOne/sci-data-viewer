Data Source REST Interface
==========================

Data sources expose application data through a small read-oriented REST
interface. A source may optionally provide two independent access capabilities:

* **sequential** — session-based forward traversal;
* **addressable** — retrieval of individual items by stable identifier.

A source supporting neither capability is referred to as a **plain** source.
The capabilities are independent; a source may support either, both, or neither::

                        addressable
                      no              yes
     sequential  ┌──────────────┬──────────────────┐
         no      │    plain     │   addressable    │
                 ├──────────────┼──────────────────┤
         yes     │  sequential  │ sequential + ID  │
                 └──────────────┴──────────────────┘

The source descriptor MUST advertise supported capabilities explicitly:

.. code-block:: json
   :caption: Example of an addressable + sequential data source descriptor.

    {
        "data-url": "/api/source/events",
        "sequential": true,
        "addressable": true
    }

A plain source (neither capability) MUST still advertise both flags as
``false`` rather than omitting them:

.. code-block:: json
   :caption: Example of a plain data source descriptor.

    {
        "data-url": "/api/source/showroom",
        "sequential": false,
        "addressable": false
    }

Capability-specific properties described below MUST be present where required.
Additional source-specific properties MAY be provided. One common
source-specific property is a ``type`` discriminator identifying the shape of
the data served (e.g. ``"type": "geo3d"``), letting a client dispatch the
payload to the right consumer; this specification does not mandate its
presence or vocabulary since it is application-defined.

Descriptor resource
-------------------

The descriptor document above (containing ``data-url``, ``sequential``,
``addressable`` and any additional properties) is itself served from a
source-specific endpoint, external to this specification — for example, an
entry in an application's plugin or catalog manifest. That endpoint's
response body is the descriptor; it is distinct from the principal resource
described below.

``data-url`` in the descriptor identifies the principal resource. Every URI
in the remainder of this document (``/resource``, ``/resource/{id}``,
``/resource/sessions``, ...) is expressed relative to that ``data-url``,
which acts as ``/resource`` for that source. For example, a descriptor with
``"data-url": "/api/source/events"`` places the sessions collection at
``/api/source/events/sessions``.

Common resource
---------------

Every source has a principal resource, located at the descriptor's
``data-url``::

    GET /resource

For a plain source, this returns the data representation itself.

For sources providing additional access capabilities, it represents the source
as a whole and MAY contain metadata, enumeration information, or other
source-level data. Clients MUST NOT assume that it represents an individual
item.

``GET`` requests MUST be safe: retrieving a representation MUST NOT advance an
iterator or otherwise modify application-visible source state. Repeated ``GET``
requests may nevertheless return different representations when the underlying
data have changed.

Sequential capability
---------------------

A sequential source provides forward traversal through explicit session
resources.

A traversal session is created with::

    POST /resource/sessions

This version of the specification defines no request body for session
creation: every session starts at the beginning of the source's sequence.
Parameterized traversal (filters, starting offsets) is out of scope and left
for a future revision.

A successful request returns ``201 Created``, identifies the newly created
session using the ``Location`` response header, and SHOULD return its initial
representation in the response body:

    Location: /resource/sessions/4fd732

.. code-block:: json

    {
        "current": "event-001",
        "finished": false
    }

The session resource represents one independent traversal state::

    GET /resource/sessions/{session}

and returns a JSON object of the form:

.. code-block:: json

    {
        "current": <item>,
        "finished": false
    }

``current`` represents the item at the current iterator position. It MUST be
either:

* an opaque string identifier; or
* a JSON object containing the current item representation.

Clients MUST NOT assign semantic meaning to a string identifier beyond using it
with operations advertised by the source. In particular, identifiers need not
be numeric, ordered, or otherwise related to the iterator position.

For a sequential source that is not addressable, a string ``current`` still
carries no addressing operation, but remains useful for opaque equality
comparison (e.g. detecting whether the position has changed across polls) and
for diagnostic logging.

If the source is also addressable, a string returned as ``current`` MUST be a
valid item identifier accepted by::

    GET /resource/{id}

An object returned as ``current`` MAY contain an ``id`` member when the item also
has a stable identifier.

The iterator is advanced explicitly::

    POST /resource/sessions/{session}

One successful request advances the session by exactly one item and returns
the resulting session representation. This version of the specification
defines no batch-advance or seek operation; a client wanting to skip ahead
issues repeated single-item advances.

At the end of the sequence the session returns:

.. code-block:: json

    {
        "current": null,
        "finished": true
    }

Once ``finished`` becomes true, further advancement MUST NOT restart or wrap
the sequence implicitly.

A session is released with::

    DELETE /resource/sessions/{session}

A successful release returns ``204 No Content``.

Sequential access guarantees only forward traversal. It does not imply random
access, backward traversal, efficient skipping, a known sequence length, or
stable item identifiers.

Session identifiers are opaque strings. Session lifetime and expiration policy
are implementation-specific. An expired or explicitly removed session SHOULD
return ``404 Not Found`` or ``410 Gone``, depending on whether the
implementation can distinguish the two cases.

Addressable capability
----------------------

An addressable source guarantees retrieval of an item by a stable opaque
identifier::

    GET /resource/{id}

Identifiers MUST be represented as strings. Clients MUST NOT assume any
particular syntax, ordering, or relationship between identifiers.

The source descriptor additionally describes its enumeration capabilities:

.. code-block:: json

    {
        "addressable": true,
        "collection": {
            "finite": true,
            "enumerable": true,
            "pagination": true,
            "page-size": 100
        }
    }

Finite collections
~~~~~~~~~~~~~~~~~~

``finite`` specifies whether the collection is known to contain a finite number
of addressable items.

.. code-block:: json

    "finite": true

means that the source has a finite collection, although determining its total
size MAY still be expensive or unsupported.

.. code-block:: json

    "finite": false

means that the collection may grow indefinitely or otherwise has no meaningful
fixed end.

Finiteness does not imply enumerability.

Enumeration
~~~~~~~~~~~

``enumerable`` specifies whether the source can list available item identifiers.

When false, the only guaranteed addressable operation is::

    GET /resource/{id}

and the client must obtain valid identifiers elsewhere.

When true, the principal resource supports enumeration::

    GET /resource

and returns a JSON object containing an ``items`` array:

.. code-block:: json

    {
        "items": [
            "event-001",
            "event-002",
            "event-003"
        ]
    }

Items in this array MUST be opaque string identifiers accepted by
``GET /resource/{id}``.

For a finite collection, the response SHOULD contain ``total`` when its value
can be determined without unreasonable cost:

.. code-block:: json

    {
        "items": [...],
        "total": 18342
    }

Pagination
~~~~~~~~~~

An enumerable source MAY additionally support pagination.

When:

.. code-block:: json

    "pagination": true

the source MUST accept the standard query parameters::


    GET /resource?page={page}&page-size={page-size}

``page`` is a zero-based page index.

``page-size`` is the requested maximum number of identifiers returned in one
response. The server MAY impose an upper limit.

The descriptor's ``page-size`` specifies the default page size used when a
request omits the ``page-size`` query parameter. The descriptor's
``max-page-size``, if present, is the upper limit the server imposes on the
``page-size`` query parameter; a request exceeding it SHOULD be clamped to
this value rather than rejected:

.. code-block:: json

    {
        "pagination": true,
        "page-size": 100,
        "max-page-size": 1000
    }

A paginated response has the form:

.. code-block:: json

    {
        "items": [
            "event-100",
            "event-101"
        ],
        "page": 1,
        "page-size": 100,
        "total": 18342
    }

``total`` MAY be omitted when the total collection size is unknown or expensive
to determine.

An empty ``items`` array indicates that the requested page contains no entries.

When ``pagination`` is false, ``GET /resource`` returns the complete enumeration.
Consequently, sources SHOULD enable pagination whenever enumeration may become
large.

Pagination does not imply finiteness. A growing collection may provide
paginated access without having a stable final page or total item count.

Combined capability
-------------------

A source may support both sequential and addressable access::

    /resource
    │
    ├── GET /
    │      source representation / enumeration
    │
    ├── GET /{id}                         [addressable]
    │      retrieve item by ID
    │
    └── sessions                          [sequential]
         │
         ├── POST /
         │      create session
         │
         └── {session}
              ├── GET
              │      inspect current item
              ├── POST
              │      advance
              └── DELETE
                     release session

For such a source, an identifier returned as the sequential session's
``current`` value refers to the same item namespace as ``GET /resource/{id}``.

The two capabilities otherwise remain independent.

Query options
-------------

A source MAY advertise a set of query-string options accepted by whichever
endpoint returns its actual data representation: ``GET /resource`` for a
plain source, or ``GET /resource/{id}`` for an addressable one (a plain
source has no other GET returning data; an addressable one's ``GET
/resource`` returns an enumeration instead, so options apply to the
per-item retrieval, not the listing). This lets a generic client render
matching form controls and append the right query parameters, without any
source-specific client code.

The descriptor's optional ``query-options`` is an array of parameter
descriptions. The example below is addressable+enumerable (see
"Addressable capability" above); ``wBoundaries`` applies to
``GET /resource/{id}``:

.. code-block:: json

    {
        "data-url": "/plugins/na58geom/geometry",
        "sequential": false,
        "addressable": true,
        "collection": {
            "finite": true,
            "enumerable": true,
            "pagination": true,
            "page-size": 20
        },
        "query-options": [
            {
                "name": "wBoundaries",
                "in": "query",
                "required": false,
                "description": "Also render each detector's wire-based boundary as a dashed outline.",
                "schema": {
                    "type": "boolean",
                    "default": true
                }
            }
        ]
    }

Each entry is a deliberately small subset of the `OpenAPI Parameter Object
<https://swagger.io/specification/#parameter-object>`_: ``name`` is the
query-string key; ``in`` is always ``"query"`` (present for compatibility,
since OpenAPI also defines ``"path"``/``"header"``/``"cookie"`` parameters
this specification does not use); ``required`` states whether the source
rejects a request omitting it; ``description`` is a human-readable doc
string a client MAY show as a label or tooltip. Value constraints live under
``schema``, using a JSON-Schema-compatible vocabulary:

``schema.type``
    One of ``"boolean"``, ``"integer"``, ``"number"``, or ``"string"``.

``schema.default``
    The value assumed when the client omits the parameter. Required in
    practice whenever ``required`` is ``false``, so the client knows what
    behavior it is opting out of by not setting it.

``schema.minimum`` / ``schema.maximum``
    OPTIONAL, and only meaningful for ``"integer"``/``"number"``.

``schema.enum``
    OPTIONAL list of allowed string values, only meaningful for
    ``"string"``. A ``"string"`` option without ``enum`` accepts free text.

A source omitting ``query-options`` entirely accepts no query parameters
beyond what pagination (above) already defines.

HTTP conventions
----------------

Implementations SHOULD follow ordinary HTTP semantics and status codes:

============================= =====================================================
Status                        Meaning
============================= =====================================================
``200 OK``                    Successful retrieval or operation
``201 Created``               Traversal session created
``204 No Content``            Successful operation with no response representation
``400 Bad Request``           Invalid identifier, query, or operation parameters
``404 Not Found``             Resource, item, page, or session does not exist
``410 Gone``                  Previously valid item/session is no longer available
``500 Internal Server Error`` Unexpected source failure
``503 Service Unavailable``   Source exists but is temporarily unavailable
============================= =====================================================

HTTP caching mechanisms (``Cache-Control``, ``ETag``, ``Last-Modified``, conditional
requests) SHOULD be used where appropriate. Whether the underlying data change
over time is independent of the access capabilities defined above.

Error responses MAY include a JSON body describing the failure; this
specification defines no required schema for it. Clients MUST rely on the
HTTP status code, not the presence or shape of a body, to determine the
outcome of a request.

Cross-origin sources
---------------------

A source need not be hosted by, or same-origin with, the application that
consumes it: a client MAY be given nothing but a source's principal URL
(``data-url``) and follow this specification directly, without any
server-side integration on the consuming application's side.

When a source is consumed this way, a browser-based client fetches every
endpoint defined by this specification directly from the source's origin.
The source MUST therefore serve CORS headers (``Access-Control-Allow-Origin``,
and a valid response to the CORS preflight for state-changing requests) on
*all* of its endpoints — the descriptor, the principal resource, individual
items, and session resources alike — permitting the consuming origin.
A source that omits this is only reachable through a same-origin
intermediary (e.g. a server-side plugin proxying or re-exposing it), not
directly by a browser client.

URI summary
-----------

Full summary::

    GET    /resource                         always

    GET    /resource/{id}                    if addressable

    GET    /resource                         enumeration, if enumerable
           ?page=...
           &page-size=...                    if paginated

    POST   /resource/sessions                if sequential
    GET    /resource/sessions/{session}      if sequential
    POST   /resource/sessions/{session}      if sequential
    DELETE /resource/sessions/{session}      if sequential

