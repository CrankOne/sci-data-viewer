import * as THREE from "three";

export const type = "Plane";

export function make_geometry(material, geoDef, context = {}) {
    const geo = new THREE.PlaneGeometry(...geoDef.sizes);
    return new THREE.Mesh(geo, material);
}

export function make_overlay_geometry(geoDef, context={}) {
    const geo = new THREE.PlaneGeometry(...geoDef.sizes);
    if(!context.hasOwnProperty('meshSelectionMaterial')) {
        throw new Error('Context does not provide "meshSelectionMaterial" to create pickable mesh overlay');
    }
    return new THREE.Mesh(geo, context.meshSelectionMaterial);
}

