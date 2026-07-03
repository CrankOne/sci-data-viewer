import * as THREE from 'three';
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
    //if(typeof definition.dispose !== "function")
    //    throw new Error(`Drawable "${definition.type}" has no dispose()`);
    registry.set(definition.type, definition);
}

//
// Constructor, destructor

export function make_geometry(geoType, material, geoDef, userData, context = {}) {
    const definition = registry.get(geoType);
    if(!definition) throw new Error(`Unknown geometry type: ${geoType}`);
    
    // create group addressing the drawable
    const group = new THREE.Group();
    // this won't work for raycasting as group does not seem to be hit
    //for(const [udKey, udVal] of Object.entries(userData)) {
    //    group.userData[udKey] = udVal;
    //}

    // create the drawable item itself
    const base = definition.make_geometry(material, geoDef, context);
    if(userData.hasOwnProperty('srcID') && userData.hasOwnProperty('geoID')) {
        base.name = `base-${userData.geoID}@${userData.srcID}`;
    }
    // attach user data to a base object (not to the group itself)
    for(const [udKey, udVal] of Object.entries(userData)) {
        base.userData[udKey] = udVal;
    }
    base.userData.pickable = (geoDef._pickable !== false);

    group.add(base);
    // if picking is not explicitly disabled (by default)
    if(base.userData.pickable) {
        if(typeof definition.make_overlay_geometry !== "function") {
            console.warn(`Drawable "${definition.type}" has no make_overlay_geometry() to indicate picking/selection`);
        } else {
            const highlight = definition.make_overlay_geometry(geoDef, context);
            if(userData.hasOwnProperty('srcID') && userData.hasOwnProperty('geoID')) {
                highlight.name = `hl-${userData.geoID}@${userData.srcID}`;
            }
            highlight.visible = false;  // overlay is hidden by default
            group.add(highlight);
        }
    }
    return group;
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
