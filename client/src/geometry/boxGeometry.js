import * as THREE from "three";

export const type = "BoxGeometry";

export function make_geometry(material, geoDef, context = {}) {
    console.debug(`Creating box geometry of ${geoDef.sizes[0]}x${geoDef.sizes[1]}x${geoDef.sizes[2]}`);
    const geo = new THREE.BoxGeometry(...geoDef.sizes);
    return new THREE.Mesh(geo, material);
}

export function make_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('meshSelectionMaterial')) {
        throw new Error('Context does not provide "meshSelectionMaterial" to create pickable mesh overlay');
    }
    return make_geometry(context.meshSelectionMaterial, geoDef, context);
}

