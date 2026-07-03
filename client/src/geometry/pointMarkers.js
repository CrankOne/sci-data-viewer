import * as THREE from "three";

export const type = "PointMarkers";

export function make_geometry(material, geoDef, context = {}) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    geoDef.items.forEach((pt) => {
            positions.push(pt.position);
            colors.push(pt.color);
            sizes.push(pt.size);
        });
    geometry.setAttribute( 'position',  new THREE.Float32BufferAttribute( positions.flat(), 3 ) );
    geometry.setAttribute( 'color',     new THREE.Float32BufferAttribute( colors.flat(), 3 ) );
    geometry.setAttribute( 'size',      new THREE.Float32BufferAttribute( sizes, 1) );
    return new THREE.Points(geometry, material);
}

export function make_overlay_geometry(geoDef, context={}) {
    if(!context.hasOwnProperty('pointsSelectionMaterial')) {
        throw new Error('Context does not provide "pointsSelectionMaterial" to create pickable mesh overlay');
    }
    return make_geometry(context.pointsSelectionMaterial
            , geoDef
            , context.pointsSelectionMaterial);
}

