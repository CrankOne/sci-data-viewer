import * as coloredLineSegments from "./coloredLineSegments";
import * as pointMarkers from "./pointMarkers";
import * as boxGeometry from "./boxGeometry";
import * as plane from "./plane";
import * as line from "./line";

const registry = new Map();

export function register(definition) {
    if(!definition.type)
        throw new Error("Drawable definition has no type");
    if(typeof definition.make_geometry !== "function")
        throw new Error(`Drawable "${definition.type}" has no make_geometry()`);
    //if(typeof definition.set_highlight !== "function")
    //    throw new Error(`Drawable "${definition.type}" has no set_highlight()`);
    //if(typeof definition.remove_highlight !== "function")
    //    throw new Error(`Drawable "${definition.type}" has no remove_highlight()`);
    //if(typeof definition.set_selected !== "function")
    //    throw new Error(`Drawable "${definition.type}" has no set_selected()`);
    //if(typeof definition.remove_selected !== "function")
    //    throw new Error(`Drawable "${definition.type}" has no remove_selected()`);
    registry.set(definition.type, definition);
}

//
// Constructor, destructor

export function make_geometry(geoType, material, geoDef, context = {}) {
    const definition = registry.get(geoType);
    if (!definition)
        throw new Error(`Unknown geometry type: ${geoType}`);
    return definition.make_geometry(material, geoDef, context);
}

export function dispose(geoType, material, geoDef, context = {}) {
    const definition = registry.get(geoType);
    if (!definition)
        throw new Error(`Unknown geometry type: ${geoType}`);
    // ...
}

//
// Highlight

export function set_highlight(geoType, geoDef, context={}) {
    const definition = registry.get(geoType);
    if (!definition)
        throw new Error(`Unknown geometry type: ${geoType}`);
    // ...
}

export function remove_highlight(geoType, geoDef, context={}) {
    const definition = registry.get(geoType);
    if (!definition)
        throw new Error(`Unknown geometry type: ${geoType}`);
    // ...
}

//
// Select

export function set_selected(geoType, geoDef, context={}) {
    const definition = registry.get(geoType);
    if (!definition)
        throw new Error(`Unknown geometry type: ${geoType}`);
    // ...
}

export function remove_selected(geoType, geoDef, context={}) {
    const definition = registry.get(geoType);
    if (!definition)
        throw new Error(`Unknown geometry type: ${geoType}`);
    // ...
}

register(coloredLineSegments);
register(pointMarkers);
register(boxGeometry);
register(plane);
register(line);
