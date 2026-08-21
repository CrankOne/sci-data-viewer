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
// `contextStoreModules: {<name>: <factory returning a fresh Vuex module
// options object>, ...}`; store/modules/contexts.js reads these generically
// to register/unregister one dynamic module instance per context, with no
// dataType-specific knowledge of its own. A non-contextual module type
// (e.g. a future stateless viewer) simply omits both fields.

// Sink-related fields (cross-module "selection sink" mechanism, doc/ui-
// session.rst's "Extension points" / "Selection sinks"):
//
// `acceptsPayloadTypes: string[] | '*'` -- mandatory alongside
// `receiveSinkMutation`: the closed vocabulary of payload types this
// module is willing to land in its sinkInbox, or the wildcard `'*'` for a
// module that doesn't discriminate (e.g. modules/sink-view/'s dev stub, or
// any inbox that just lists whatever arrives). A *link* (store/modules/
// contexts.js's `sinkTargets[targetDataType]`) always names exactly one
// payload type from this list (or `'*'` itself, meaning "any"); this is
// how a target declares what it can receive without either side needing
// to inspect an item's actual shape to guess what it is.
//
// `buildSinkSnapshot: (store, contextId) => [{itemId, srcID, payloadType,
// snapshot}]` -- optional, for a module that can be a sink *origin* via
// its own selection state (`selection_<ctx>`, store/selection.js). Each
// returned item carries its own `payloadType` -- deliberately not one
// fixed type for the whole module, since e.g. a graph selection can mix
// nodes and edges. There's no separate "what types can this module
// produce" declaration: a module is free to tag items with whatever
// payload type fits per item; only the *receiving* side's vocabulary
// (`acceptsPayloadTypes` above) is a fixed, checked list. store/
// sinkDispatch.js's `send_selection_to_sink` is the one generic caller.
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
