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

