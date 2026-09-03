// Client-side registry of viewer modules, each handling a distinct data
// source "type" (as declared by a data source's manifest). Mirrors the
// registration pattern already used one level down, for per-item
// geometry/material types (see geometry/registry.js, materials/registry.js
// inside modules/three-view/): a module self-registers by importing this
// file and calling register_module() at load time (see
// modules/three-view/index.js).
//
// A module MAY be "contextual": it needs isolated, per-instance state
// (e.g. geo3d's loaded geometry, selection, transform groups -- one
// independent copy per "scene"). Such a module sets `contextual: true` and
// `contextStoreModules: {<name>: <factory(contextId) returning a fresh Vuex
// module options object>, ...}`; store/modules/contexts.js reads these
// generically to register/unregister one dynamic module instance per
// context, passing that context's own id to each factory (so a module's
// getters can filter connection.js's `resources` down to "mine" -- see
// below) with no dataType-specific knowledge of its own. A non-contextual
// module type (e.g. a future stateless viewer) simply omits both fields.
//
// A resource's fetched data (doc/data-model.rst's "Resolution is always
// live, never copied"): connection.js keeps a loaded resource's raw fetched
// body on the resource record itself (`resource.data`) rather than pushing
// a shaped copy into any module's own state. A contextual module that wants
// to show that data defines its own getter, closed over its
// `contextStoreModules` factory's `contextId` argument, that reads
// `rootState.connection.resources` directly -- filtered to this context's
// id and this module's own dataType -- and shapes each matching resource's
// `data` through a small private pure-transform helper local to that
// module's own store file (see modules/three-view/store/view3D.js's
// `geoData` getter for the pattern). There is no registry-declared hook for
// this transform: unlike `resolveSinkItem` below, which store/sinkResolve
// .js calls generically across every module, this transform only ever has
// one caller -- that module's own getter -- so it lives right next to it
// rather than being routed back through this file.

// Sink-related fields (cross-module "selection sink" mechanism, doc/ui-
// session.rst's "Extension points" / "Selection sinks"):
//
// `acceptsPayloadTypes: string[] | '*'` -- mandatory alongside
// `receiveSinkMutation`: the closed vocabulary of payload types this
// module is willing to land in its sinkInbox, or the wildcard `'*'` for a
// module that doesn't discriminate (e.g. modules/sink-view/'s dev stub, or
// any inbox that just lists whatever arrives). A *link* (store/modules/
// contexts.js's `sinkLinks`) always names exactly one payload type from
// this list (or `'*'` itself, meaning "any"); this is how a target
// declares what it can receive without either side needing to inspect an
// item's actual shape to guess what it is.
//
// `buildSinkSnapshot: (store, contextId) => [{itemId, srcID, payloadType,
// originRef, snapshot}]` -- optional, for a module that can be a sink
// *origin* via its own selection state (`selection_<ctx>`, store/
// selection.js). Each returned item carries its own `payloadType` --
// deliberately not one fixed type for the whole module. `payloadType`
// names the type of whatever secondary data the item itself carries (e.g.
// a graph node's `subjectData`, doc/module-graph.rst's "Subject data"),
// never the item's own structural role or its origin module's `dataType`
// -- an item with no such data yields nothing. This is what lets a
// receiver (doc/ui-session.rst's "Selection sinks") stay agnostic of which
// module or which kind of item something came from: it only ever sees a
// type from its own accepted vocabulary. There's no separate "what types
// can this module produce" declaration: a module is free to tag items with
// whatever payload type fits per item; only the *receiving* side's
// vocabulary (`acceptsPayloadTypes` above) is a fixed, checked list.
// store/sinkDispatch.js's `send_selection_to_sink` is the one generic
// caller. `originRef` is opaque outside this module -- whatever internal
// key `resolveSinkItem` below needs to find this same item again later;
// `itemId`/`srcID` are the cross-module-presentable identity, shown to
// receivers, and may differ from it.
//
// `resolveSinkItem: (store, contextId, originRef) => {itemId, srcID,
// payloadType, snapshot} | null` -- mandatory alongside `buildSinkSnapshot`
// (`register_module` throws if one is declared without the other): given
// one `originRef` a past `buildSinkSnapshot` call produced, re-derive that
// same item's *current* data, independent of whether it's still selected.
// store/sinkDispatch.js never persists `snapshot` itself (only the
// reference); store/sinkResolve.js calls this on every consumer read
// instead, so forwarded data is always live and -- since a removed
// context's dynamic Vuex modules are gone, and this is simply never called
// for a `contexts/context` that no longer resolves -- automatically stops
// existing when its origin context does, with no separate cleanup required
// for correctness. Typically factors out the same per-item lookup
// `buildSinkSnapshot` already does, keyed by `originRef` instead of
// iterating the current selection (see modules/graph/index.js).
// `scopeNoun` -- optional, meaningful only alongside `contextual: true`: the
// short lowercase noun store/modules/contexts.js's mk_default_name uses to
// name a newly-created context of this dataType ("plot-1", "diagram-23"),
// distinct from `label` (a longer, capitalized phrase for menus/pickers).
// Falls back to the dataType itself when omitted.
const registry = new Map();

export function register_module(definition) {
    if(!definition.dataType)
        throw new Error("Viewer module definition has no dataType");
    if(!definition.viewportComponent)
        throw new Error(`Viewer module "${definition.dataType}" has no viewportComponent`);
    if(definition.contextual && !definition.contextStoreModules)
        throw new Error(`Viewer module "${definition.dataType}" is contextual but declares no contextStoreModules`);
    if(definition.receiveSinkMutation && !definition.acceptsPayloadTypes) {
        throw new Error(`Viewer module "${definition.dataType}" declares receiveSinkMutation but no acceptsPayloadTypes`);
    }
    if(definition.buildSinkSnapshot && !definition.resolveSinkItem) {
        throw new Error(`Viewer module "${definition.dataType}" declares buildSinkSnapshot but no resolveSinkItem`);
    }
    registry.set(definition.dataType, definition);
}

export function get_module(dataType) {
    return registry.get(dataType) ?? null;
}

export function all_modules() {
    return [...registry.values()];
}

// Whether `dataType`'s module is willing to receive `payloadType` items --
// either it declared the wildcard, or `payloadType` is literally in its
// list, or the *link* itself was set up as "any" (payloadType === '*',
// only offered by ConnectScopeModal.vue when the target itself is '*').
export function payload_type_accepted(dataType, payloadType) {
    const mod = get_module(dataType);
    const accepted = mod?.acceptsPayloadTypes;
    if(!accepted) return false;
    if(accepted === '*' || payloadType === '*') return true;
    return accepted.includes(payloadType);
}
