// Client-side registry of viewer modules, each handling a distinct data
// source "type" (as declared by a data source's manifest). Mirrors the
// registration pattern already used one level down, for per-item
// geometry/material types (see geometry/registry.js, materials/registry.js
// inside modules/three-view/): a module self-registers by importing this
// file and calling register_module() at load time (see
// modules/three-view/index.js).

const registry = new Map();

export function register_module(definition) {
    if(!definition.dataType)
        throw new Error("Viewer module definition has no dataType");
    if(!definition.viewportComponent)
        throw new Error(`Viewer module "${definition.dataType}" has no viewportComponent`);
    registry.set(definition.dataType, definition);
}

export function get_module(dataType) {
    return registry.get(dataType) ?? null;
}

export function all_modules() {
    return [...registry.values()];
}
