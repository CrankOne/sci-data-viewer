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

const registry = new Map();

export function register_module(definition) {
    if(!definition.dataType)
        throw new Error("Viewer module definition has no dataType");
    if(!definition.viewportComponent)
        throw new Error(`Viewer module "${definition.dataType}" has no viewportComponent`);
    if(definition.contextual && !definition.contextStoreModules)
        throw new Error(`Viewer module "${definition.dataType}" is contextual but declares no contextStoreModules`);
    registry.set(definition.dataType, definition);
}

export function get_module(dataType) {
    return registry.get(dataType) ?? null;
}

export function all_modules() {
    return [...registry.values()];
}
