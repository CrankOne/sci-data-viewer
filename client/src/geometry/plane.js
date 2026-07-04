import * as THREE from "three";

export const type = "Plane";

export function make_geometry(material, geoDef, context = {}) {
    const geo = new THREE.PlaneGeometry(...geoDef.sizes);
    return new THREE.Mesh(geo, material);
}

export function make_highlight_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('meshHighlightedMaterial')) {
        throw new Error('Context does not provide "meshHighlightedMaterial" to create highlighted mesh overlay');
    }
    return make_geometry(context.meshHighlightedMaterial, geoDef, context);
}

export function make_selected_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('meshSelectedMaterial')) {
        throw new Error('Context does not provide "meshSelectedMaterial" to create selected mesh overlay');
    }
    return make_geometry(context.meshSelectedMaterial, geoDef, context);
}

