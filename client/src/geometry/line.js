import * as THREE from "three";

export const type = "Line";

export function make_geometry(material, geoDef, context = {}) {
    const refPointVecs = geoDef.points.map((pt) => new THREE.Vector3(...pt));
    const refTrackGeo = new THREE.BufferGeometry().setFromPoints(refPointVecs);
    const line = new THREE.Line(refTrackGeo, material);
    return line;
}

export function make_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('lineSelectionMaterial')) {
        throw new Error('Context does not provide "lineSelectionMaterial" to create pickable line overlay');
    }
    return make_geometry(context.lineSelectionMaterial
        , geoDef
        , context
        );
}

