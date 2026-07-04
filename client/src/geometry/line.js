import * as THREE from "three";

export const type = "Line";

export function make_geometry(material, geoDef, context = {}) {
    const refPointVecs = geoDef.points.map((pt) => new THREE.Vector3(...pt));
    const refTrackGeo = new THREE.BufferGeometry().setFromPoints(refPointVecs);
    const line = new THREE.Line(refTrackGeo, material);
    return line;
}

export function make_highlight_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('lineHighlightedMaterial')) {
        throw new Error('Context does not provide "lineHighlightedMaterial" to create highlighted line overlay');
    }
    return make_geometry(context.lineHighlightedMaterial, geoDef, context);
}

export function make_selected_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('lineSelectedMaterial')) {
        throw new Error('Context does not provide "lineSelectedMaterial" to create selected line overlay');
    }
    return make_geometry(context.lineSelectedMaterial, geoDef, context);
}

