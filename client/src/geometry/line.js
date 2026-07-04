import * as THREE from "three";

import { Line2 } from 'three/addons/lines/Line2.js';

export const type = "Line";

export function make_geometry(material, geoDef, context = {}) {
    const refPointVecs = geoDef.points.map((pt) => new THREE.Vector3(...pt));
    const refTrackGeo = new THREE.BufferGeometry().setFromPoints(refPointVecs);
    const line = new THREE.Line(refTrackGeo, material);
    return line;
}

export function make_highlight_overlay_geometry(geoDef, context={}) {
    const refPointVecs = geoDef.points.map((pt) => new THREE.Vector3(...pt));
    const refTrackGeo = new THREE.BufferGeometry().setFromPoints(refPointVecs);
    const line = new Line2(refTrackGeo, context.lineMaskMaterial);
    return line;
}

export function make_selected_overlay_geometry(geoDef, context={}) {
    return make_highlight_overlay_geometry(geoDef, context);
}

