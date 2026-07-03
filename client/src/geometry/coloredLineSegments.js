import * as THREE from "three";

export const type = "ColoredLineSegments";

export function make_geometry(material, geoDef, context={}) {
    const geometry = new THREE.BufferGeometry();
    const vxs = geoDef.points.map((vx) => vx[0]).flat();
    geometry.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(vxs), 3));
    const colors = geoDef.points.map(vx => vx[1]).flat();
    geometry.setAttribute('color',
        new THREE.BufferAttribute(new Float32Array(colors), 3));
    const l = new THREE.Line( geometry, material );
    l.computeLineDistances();
    return l;
}

export function make_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('lineSelectionMaterial')) {
        throw new Error('Context does not provide "lineSelectionMaterial" to create pickable line overlay');
    }
    return make_geometry(context.lineSelectionMaterial, geoDef, context);
}

