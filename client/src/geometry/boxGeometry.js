import * as THREE from "three";

export const type = "BoxGeometry";

export function make_geometry(material, geoDef, context = {}) {
    console.debug(`Creating box geometry of ${geoDef.sizes[0]}x${geoDef.sizes[1]}x${geoDef.sizes[2]}`);
    const geo = new THREE.BoxGeometry(...geoDef.sizes);
    return new THREE.Mesh(geo, material);
}
