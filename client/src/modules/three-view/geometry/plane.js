import * as THREE from "three";

export const type = "Plane";

export function make_geometry(material, geoDef, context = {}) {
    const geo = new THREE.PlaneGeometry(...geoDef.sizes);
    return new THREE.Mesh(geo, material);
}

export function make_highlight_overlay_geometry(material, geoDef, context={}) {
    return make_geometry(material || context.meshMaskMaterial, geoDef, context);
}

export function make_selected_overlay_geometry(material, geoDef, context={}) {
    return make_geometry(material || context.meshMaskMaterial, geoDef, context);
}
