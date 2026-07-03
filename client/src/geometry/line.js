import * as THREE from "three";

export const type = "Line";

export function make_geometry(material, geoDef, context = {}) {
    const refPointVecs = geoDef.points.map((pt) => new THREE.Vector3(...pt));
    const refTrackGeo = new THREE.BufferGeometry().setFromPoints(refPointVecs);
    const line = new THREE.Line(refTrackGeo, material);
    return line;
}

