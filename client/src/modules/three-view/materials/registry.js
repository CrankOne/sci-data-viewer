import * as lineMaterial from "./lineMaterial";
import * as meshMaterial from "./meshMaterial";
import * as pointMarkersShaderMaterial from "./pointMarkersShaderMaterial";
import * as coloredLineShaderMaterial from "./coloredLineShaderMaterial";
//import * as

const registry = new Map();

export function register(definition) {
    if(!definition.type)
        throw new Error("Material definition has no type");
    if(typeof definition.make_material !== "function")
        throw new Error(`Material "${definition.type}" has no make_material()`);
    registry.set(definition.type, definition);
}

// Returns {base: ..., mask: ...} materials
export function make_material(matType, matDef, context = {}) {
    const definition = registry.get(matType);
    if(!definition)
        throw new Error(`Unknown material type: ${matType}`);
    const r = {base: definition.make_material(matDef, context), mask: null};
    if(typeof definition.make_mask_material === 'function') {
        // has special mask material
        r.mask = definition.make_mask_material(matDef);
    }
    return r;
}

export function dispose(matType, mat, context = {}) {
    const definition = registry.get(matType);
    if(!definition)
        throw new Error(`Unknown material type: ${matType}`);
    // ...
}

register(lineMaterial);
register(meshMaterial);
register(pointMarkersShaderMaterial);
register(coloredLineShaderMaterial);
