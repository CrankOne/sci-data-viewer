import * as THREE from "three";

export const type = "Plane";

export function make_geometry(material, geoDef, context = {}) {
    const geo = new THREE.PlaneGeometry(...geoDef.sizes);
    return new THREE.Mesh(geo, material);
}
