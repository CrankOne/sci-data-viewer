import * as THREE from "three";

export const type = "PointMarkers";

export function make_geometry(material, geoDef, context = {}) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    geoDef.items.forEach(pt => {
        positions.push(pt.position);
        colors.push(pt.color);
        sizes.push(pt.size || material.uniforms.pointTexture.value.image.width);
    });
    // ^^^ NOTE: it is important that default size matches the one used to
    //     create the material's texture
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors.flat(), 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    const geo = new THREE.Points(geometry, material);
    geo.userData.isPointCloud = true;
    return geo;
}

export function make_highlight_overlay_geometry(material, geoDef, context={}) {
    if(!material)
        throw new Error("No highlight material given for point markers");
    // basically, same except for all colors changed to 0xffffff
    const maskGeoDef = {
        ...geoDef,
        items: geoDef.items.map(item => ({
            ...item,
            size: (item.size || material.uniforms.pointTexture.value.image.width) * 1.25,
            color: [1, 1, 1]
        }))
    };
    return make_geometry(material, maskGeoDef, context);
}

export function make_selected_overlay_geometry(material, geoDef, context={}) {
    return make_highlight_overlay_geometry(material, geoDef, context);
}
