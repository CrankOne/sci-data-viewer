UI Session Engine
==================

This document specifies the client's **session** mechanism: the layer that
lets a user's workspace -- which panels are open, which scenes exist, which
data sources are attached to them, camera/facet/selection state -- survive a
reload, be switched between named alternatives, and be exported/imported or
shared as a link. It complements :doc:`sources` (the wire contract a data
source implements) and :doc:`module-plotter` (a future consumer of the
extension points described here).

File references below are relative to ``client/src``.

Core concepts
-------------

``session``
    A named, independently-persisted workspace; exactly one is *active* per
    browser tab (``store/modules/session.js``). A directory entry (id, name,
    timestamps) plus a scattered set of id-namespaced ``localStorage``
    entries -- see "Storage layout".

``layout``
    A binary tree of resizable splits/panels (``store/modules/layout.js``).
    A leaf holds either one *module* widget instance (a viewport) or an
    ordered stack of *subpanel* instances. Purely about arrangement -- it
    references widget instances by id and knows nothing about scenes/data.

``context``
    Isolated, per-instance state for one *contextual* viewer module type --
    today, one geo3d "scene" (``store/modules/contexts.js``). Owns
    dynamically-registered Vuex modules (``view3D_<ctxId>``,
    ``transfGroups_<ctxId>``) and, where applicable, their persisted facet
    presets / selection sets.

``widget instance``
    The join between a layout leaf and, optionally, a context
    (``store/modules/widgetInstances.js``), identified by ``itemType``:
    ``"<dataType>:module"`` (viewport), ``"<dataType>:<section-id>"``
    (module subpanel), or ``"core:sources"``/``"core:appearance"`` (app-shell
    subpanels). A viewport's context is fixed at creation; a subpanel's may
    be reassigned later.

``module`` (viewer module)
    A compiled-in handler for one data ``type``, self-registered via
    ``modules/registry.js`` (e.g. ``modules/three-view``) -- distinct from a
    server-side *plugin* (contributes data sources) or a *data source* (one
    instance of data a module renders). See "Extension points".

``data source`` / ``resource``
    One connection to a :doc:`sources`-conformant endpoint, tracked in
    ``connection.js``'s ``resources`` map by a session-unique name. Never
    persisted as fetched data, only as the coordinates to re-fetch it.

Storage layout
--------------

Everything is ``localStorage``-backed JSON, one key per concern, under a
``viewer.`` prefix; session-scoped keys embed the session id (and, for
per-context state, the context id) as a dot-separated suffix:

================================================ ============================================
Key                                              Holds
================================================ ============================================
``viewer.sessions.v1``                           The session directory (not scoped).
``viewer.session-keys.v1.<sess>``                 That session's own key manifest (below).
``viewer.layout.v1.<sess>``                       Layout tree + contexts + widget instances.
``viewer.sources.v1.<sess>``                      Attached data sources.
``viewer.camera-presets.v1.<sess>``               Saved camera presets (three-view module).
``viewer.facet-presets.v1.<sess>.<ctx>``          Per-context facet presets (view3D).
``viewer.selection-sets.v1.<sess>.<ctx>``         Per-context selection sets (view3D).
``theme``                                         Global, not session-scoped.
================================================ ============================================

``viewer.active-session-id`` lives in ``sessionStorage`` instead: it survives
a *reload* of one tab but starts empty in a fresh tab/window -- the exact
distinction ``main.js`` needs at boot (below).

Every session-scoped key is *registered* against its session id via
``register_session_key(sessionId, storageKey)`` (``store/persistence.js``) at
the moment its owning module installs persistence. This registry -- itself
another ``localStorage`` entry -- is what lets ``session/remove_session`` and
``sessionExport.js`` enumerate a session's *complete* key set generically,
instead of hardcoding key-naming schemes (the per-context keys, in
particular, can't otherwise be derived without knowing which contexts
existed).

Boot and activation
--------------------

``main.js`` mounts the app/store immediately (so ``ModalHost`` exists to
render the picker), then branches on whether this *tab* has an active
session::

    router.isReady()
      │
      ▼
    sessionStorage["viewer.active-session-id"] set?
      │                              │
      yes                            no
      ▼                              ▼
    activate_session(existing,     open session-picker modal
      isNew:false, router)           (blocking, mode:'initial')
                                      │  user picks/creates/imports
                                      ▼
                                    activate_session(id, isNew?, router)

``activate_session(store, sessionId, {isNew, router})`` (``sessionActivation.js``)
is the single hydration path, used both at boot and from
``SessionPickerModal.vue``:

1. Record ``sessionId`` as this tab's active session (``sessionStorage`` +
   ``session/set_active``), then install layout/contexts/instances
   persistence, every registered module's own ``installPersistence`` hook,
   and data-source persistence -- in that order, since sources reference
   context ids that must already exist.
2. Seed the plugin manifest's default sources (``isNew``) or restore this
   session's previously-attached ones (below). Not *awaited* here (a
   slow/dead remote must not block the modal closing), but each path
   returns a promise that settles once every source it touched has.
3. If a ``router`` was given, chain a shared-link application
   (``shareLink.js``) after that settlement, then close whichever modal
   triggered this.

Switching to a *different*, already-known session while one is hydrated does
**not** rehydrate live -- the picker sets the ``sessionStorage`` pointer and
reloads the page. Tearing down and rebuilding per-context dynamic Vuex
modules in place is strictly more failure-prone than booting fresh.

Layout bootstrap
-----------------

``install_layout_persistence`` picks one of three paths from what's stored
under ``viewer.layout.v1.<sess>``: **nothing stored** -- ``layoutDefaults.js``'s
``build_default_root()`` builds fresh; **current format** (has ``contexts``/
``instances``) -- ``restore_contexts_and_instances()`` replays the
``create_context``/``create_instance`` calls that produced them (neither
slice is persisted as raw state -- replaying is what re-registers each
context's dynamic modules and reseeds their own persistence); **legacy
shape** -- ``migrate_legacy_root()`` upgrades bare pre-instance-registry ids
in place onto the same fixed ids a fresh build would use.

A brand-new session's default tree is deliberately minimal::

    +------------------+------------------------------+
    |   Data Sources    |                              |
    |  (core:sources,   |           (empty)            |
    |  nothing added)   |                              |
    |       25%         |             75%              |
    +------------------+------------------------------+

No scene/viewport and no other core subpanel is pre-created -- both are now
user-initiated, reachable via shift-click "add content" on the empty panel.
Consequently, a *default-enabled* source that turns out to need a scene
(below) must create one on demand; ``layout/firstEmptyItemsLeafId`` (first
panel with no module and no items) lets it land in that still-empty main
panel instead of ``sceneCreation.js``'s wrap-the-whole-tree fallback, which
is only actually needed once no empty panel remains to reuse.

Data sources: seeding and restoration
--------------------------------------

A session's attached sources come from two origins depending on ``isNew``,
both converging on the same per-resource sequence: ``connection/add_resource``
(manifest only) → resolve/assign a context if the type is contextual → fetch
the data, unless the source is *addressable* (its ``data-url`` enumerates
items rather than being one fetchable payload -- :doc:`sources` -- so it's
left ``ready`` for the user to pick one from its widget).

**New session** -- ``seed_default_sources()`` fetches ``GET /api/plugins``
(``pluginManifest.js``) and adds every source with ``enabledByDefault: true``.
A contextual one reuses an existing context of its ``dataType`` if any
already exists, otherwise creates one via ``create_scene_with_viewport``,
targeting the still-empty main panel above.

**Existing session** -- ``restore_persisted_sources()``
(``connectionPersistence.js``) replays ``viewer.sources.v1.<sess>``: name,
endpoint, ``contextId``, and -- for an addressable source -- its last
``selectedItemId``/``page``, so a reload resumes the same file.

Both paths run every source concurrently, returning
``Promise.allSettled(...)``: one unreachable source must not prevent the
rest of the session from loading.

Contexts and widget instances
-------------------------------

``contexts/create_context({id?, dataType, name?})`` is the only place a
context is created: it registers the ``dataType`` module's declared
``contextStoreModules`` as dynamically-namespaced Vuex modules and, only for
one that declares ``view3D``, installs that context's facet-preset/
selection-set persistence. It does **not** create a viewport.

``sceneCreation.js``'s ``create_scene_with_viewport(store, {dataType, name?,
targetPanelId?})`` is the *only* sanctioned path to create a scene
end-to-end: context, viewport instance, camera registration, and placement
-- into ``targetPanelId`` if given, else by wrapping the whole layout in a
new 50/50 split. Every "New scene…" affordance in the app (``AddContentModal``,
``AddSourceModal``, ``ConnectScopeModal``, ``AppControls.vue``, default-source
seeding) goes through this helper, guaranteeing a scene never exists without
a viewport.

Add-source modal
-----------------

``AddSourceModal.vue`` is the interactive counterpart to default-source
seeding, in two steps:

1. **Name + URL**, optionally prefilled from a "Known source" picker
   populated from the same plugin manifest; free-form entry of a foreign
   source's URL always remains available regardless of what the manifest
   offers, or even if fetching it fails. Submitting resolves the ``type``.
2. **Scene** (contextual types only) -- every existing context of that
   ``dataType`` plus "New scene…", via ``create_scene_with_viewport`` same
   as everywhere else. Cancelling here removes the still-unassigned
   resource rather than leaving an orphan.

Session export and import
---------------------------

``sessionExport.js`` is a portable, file-based alternative to the session
directory, for moving a session between browsers/deployments.

``export_session(store, sessionId)`` reads every key
``list_session_keys(sessionId)`` lists straight out of ``localStorage`` and
wraps them in a self-describing envelope: ``{format, version, exportedAt,
sessionId, name, entries: {<storageKey>: <parsed JSON>, ...}}``.

``import_session(store, bundle)`` registers it as a **brand-new** session:
every id the bundle references -- its own session id and every context/
widget-instance id inside its layout entry -- is remapped to a freshly
generated one first, so importing twice (or into a browser that already has
a same-named session) never collides. Panel/split ids are deliberately
*not* remapped -- purely internal to one layout tree, never referenced from
outside it.

What does **not** travel: a source's ``endpoint`` is an absolute URL to
wherever it actually lives. An import simply can't load a source whose
server isn't reachable from the importing client -- the same as any other
dead link, not a distinct error case.

Shareable permalinks
----------------------

``shareLink.js`` is a narrower sibling to session export: a *permalink*
encoding only which items are loaded/selected on the session's
addressable+enumerable sources -- never layout, camera, or session identity.

* Built on demand ("Copy permalink", ``AppControls.vue``), not a live
  reflection of state -- the payload (gzip + base64url) becomes a
  ``?share=`` query param on the app's one hash route.
* On open, ``apply_share_from_route`` reads and strips that param
  immediately (one-shot, or it would silently reapply on every future
  reload of that URL) and matches each entry's ``endpoint`` against the
  *opening* browser's own resources -- never by name/session/context id,
  none of which mean anything outside the browser that made the link. No
  match, or unconnected to a scene, is silently skipped -- never creates
  sources or scenes to make one fit.
* Runs only after the active session's own sources have *settled* loading
  (``activate_session`` chains it after ``sourcesSettled``), or the two
  could race the same resource and whichever finished last would silently
  win.
* Understands only ``view3D_<ctxId>`` selection today -- the one contextual
  type that exists; a second one needs this generalized (e.g. a per-module
  "share" hook next to ``payloadMutation``/``payload`` below).

Router's role
--------------

``router.js`` is intentionally minimal: one route (``"/"``), hash history.
Its job here is narrow but load-bearing: ``main.js`` awaits
``router.isReady()`` before checking for an active session (initial
navigation, including a shared-link query, is asynchronous);
``shareLink.js`` uses it to both build a permalink and strip a consumed
``share`` query without adding a history entry; ``SessionPickerModal.vue``
threads it through every ``activate_session`` call so a shared link is
applied against the *right* session's resources.

Removal semantics
-------------------

``session/remove_session(id)`` deletes the directory entry, then removes
every key ``list_session_keys(id)`` lists (layout, sources, camera presets,
every per-context facet-preset/selection-set pair) plus the manifest entry
itself -- generic, thanks to the key manifest, unlike the fixed-prefix list
this used before it existed.

The currently-active session is exempt in the UI (remove button disabled):
deleting the session backing a tab's already-hydrated store, with
``sessionStorage`` still pointing at it, has no clean recovery path from the
picker. Export is unaffected by this guard -- read-only, and safe even for
the active session, since every ``*Persistence.js`` writer commits
synchronously within the same mutation-subscribe tick the store changed in.

Extension points
------------------

A new viewer module (e.g. the 2D function plotter, :doc:`module-plotter`)
integrates purely by fulfilling ``modules/registry.js``'s contract --
nothing above is aware of any specific module:

``dataType`` (required)
    The source ``type`` string this module handles.
``viewportComponent`` (required)
    Component rendered into a module-kind layout leaf.
``contextual`` / ``contextStoreModules``
    Set both together for isolated per-scene state; ``contexts.js``
    registers/persists those dynamic modules generically.
``sidePanelSections``
    Subpanel item definitions (id, title, component), offered alongside the
    two core ones (``modules/panelItems.js``).
``payloadMutation`` / ``payload``, ``removeMutation`` / ``removePayload``
    How a loaded/removed resource's data reaches/leaves this module's state
    -- ``connection.js``'s only hook into module internals.
``receiveSinkMutation``
    Optional; a function of the receiving context's id (or a bare mutation
    type string), symmetric to ``payloadMutation`` but for the cross-module
    "selection sink" mechanism instead of a data source's own resource
    pipeline (``store/sinkDispatch.js``'s only hook into module internals) --
    lets a module declare it can be a sink *target* for routed-in selections.
``removeIncomingOrigin``
    Optional; a function of the receiving context's id (or a bare mutation
    type string), symmetric to ``removeMutation`` -- ``contexts.js``'s
    ``remove_context`` calls it on every other context's module when a
    context that may have been a sink *origin* is removed, so a sink
    target's landing zone can drop that origin's entries rather than dangle.
``installPersistence(store, sessionId)``
    Optional; called once per ``activate_session``, for module-owned state
    that isn't a per-context facet/selection preset (handled generically by
    ``contexts.js``).

Selection sinks
----------------

Answers :doc:`module-3d-viewer`'s and :doc:`module-plotter`'s "Cross-module
interaction"/"Open questions" stubs on how one context's selection reaches
another context, "regardless of which module the selection originated
from" (:doc:`module-table`'s "Selection view" use case).

A **sink** is not a separately-named, independently-managed entity. It is
simply a pointer an *origin* context holds on itself:

.. code-block:: js

    // contexts.js's own per-context record
    {id, name, dataType, sinkTargets: {[targetDataType]: targetContextId}}

-- "this context's selection of ``targetDataType`` routes into that other
context." At most one target per (origin, ``targetDataType``) pair. Several
different origins may point at the *same* target id -- that is how
reuse/aggregation happens, with no separate pool of named "sink" objects
needed. ``contexts.js`` owns this state directly (``set_sink_target``/
``clear_sink_target``/``initialize_sink_targets`` mutations, ``sinkTargets``/
``sinkTarget`` getters, generic per-context persistence installed
unconditionally in ``create_context`` -- unlike ``view3D``'s facet-preset
persistence, this is not gated to any one ``dataType``) because it is a
cross-cutting property of any context, not a per-module concern.

Dispatch is **manual and one-shot**: ``store/sinkDispatch.js``'s
``send_selection_to_sink(store, {originContextId, targetDataType})`` is the
one sanctioned orchestration path (mirrors ``sceneCreation.js``'s role for
context creation) -- it snapshots the *current* selection and sends it once.
``sinkTargets`` only makes *where a future click goes* durable across
reloads; it does not subscribe to future selection changes (a clean,
separable follow-up if ever wanted).

The dispatched payload is **reference + snapshot**, not a bare pointer: each
item carries an identifying reference (its id, plus the source/resource id
it came from) *and* a snapshot of whatever data was already at hand at
dispatch time -- self-contained, no live re-fetch needed to display it, and
it still shows something even if the origin context is later removed.

The payload lands in the target context's own **separate sub-state**,
keyed by origin context id, never merged into the target's own
directly-loaded items. This is the same "keyed by contributor, wholesale
replace on update, delete on removal" shape a context's own
data-source-driven item list already needs (e.g. the plotter's
``primitivesByResource``) -- pulled into one shared factory,
``store/keyedCollection.js``, rather than hand-rolled per module.

Cleanup on removal runs both directions from ``contexts.js``'s
``remove_context``, mirroring its existing ``reassign_context_sources``
precedent (clean up a cross-reference at the removal site):

* Removed context was a sink *target* -- any other context's dangling
  ``sinkTargets`` pointer to it is cleared.
* Removed context was a sink *origin* -- any other context's module that
  declared ``removeIncomingOrigin`` (above) gets a chance to drop that
  origin's entries from its own landing zone.

**What exists today, concretely:** geo3d (``view3D.js``'s
``selectedGeoItemIDs``) is the one real sink *origin* -- a "Send selection to
sink" button in ``ItemsTree.vue`` opens the existing ``ConnectScopeModal.vue``
(now with a third ``kind: 'sink'`` branch alongside its ``'resource'``/
``'instance'`` ones) to pick or create a target, then calls
``send_selection_to_sink``. ``sinkDispatch.js``'s snapshot builder is
deliberately geo3d-specific (it reads ``view3D``'s own ``selectedGeoItemIDs``/
``geoData`` getters and recovers an accurate source id via
``destruct_geo_id``, :doc:`module-3d-viewer`'s existing ``geoID@srcID``
composite-id convention) -- a second origin type needs its own snapshot
builder alongside it, not a change to ``contexts.js`` or the registry
contract. ``modules/sink-view/`` is the one real sink *target*: a
deliberately minimal, dev-only stub (``dataType: 'sink-view'``) that lists
whatever lands in its inbox as raw JSON, existing purely to prove the
mechanism -- not a step toward the real Tabular View module
(:doc:`module-table`), which doesn't exist in this codebase yet.

**Deliberately not done here** -- open for later, not overlooked:

* Live auto-resend on every future selection change (see "manual and
  one-shot" above).
* A real, styled sink consumer (the actual Tabular View module).
* The plotter as a sink *origin* -- it has no selection model of its own
  yet (:doc:`module-plotter`'s "Open questions" still applies); dispatch
  *from* the plotter needs that designed first.
* Marker-level dispatch (``view3D``'s ``selectedMarkers``) -- whole geo-item
  selection only, for now.
* Generalizing highlight/selection themselves into a per-context primitive
  (rather than each module's own bespoke state, as geo3d's remains today)
  was the direction validated in discussion but is not what got built --
  ``sinkDispatch.js``'s geo3d-specific snapshot builder is the pragmatic
  bridge in place of that generalization.

Known limitations
-------------------

* ``shareLink.js`` and ``AppControls.vue``'s "add scene" both assume a
  single contextual module type at a time; a second needs a type picker and
  a generalized share hook (above).
* Default-source seeding issues every source's add/assign/load
  concurrently; two *different* contextual types both marked
  ``enabledByDefault`` could theoretically race for the same empty panel.
  Not observable today (one contextual type registered) and falls back
  safely (wrap-the-tree) if lost, but worth resolving before a second
  contextual module ships.
