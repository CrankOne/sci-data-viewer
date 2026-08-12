import * as THREE from "three";

export const type = "ShapeGeometry";

function build_shape(geoDef) {
    const shape = new THREE.Shape(geoDef.outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of geoDef.holes ?? []) {
        shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    }
    return shape;
}

export function make_geometry(material, geoDef, context = {}) {
    const geo = new THREE.ShapeGeometry(build_shape(geoDef));
    return new THREE.Mesh(geo, material);
}

export function make_highlight_overlay_geometry(material, geoDef, context={}) {
    return make_geometry(material || context.meshMaskMaterial, geoDef, context);
}

export function make_selected_overlay_geometry(material, geoDef, context={}) {
    return make_geometry(material || context.meshMaskMaterial, geoDef, context);
}
