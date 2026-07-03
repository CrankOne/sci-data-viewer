import * as THREE from "three";

export const type = "MeshMaterial";

export function make_material(matDef, context = {}) {
    const {
        texture: texturePath = null,
        doubleSided = true,
        wireframe = false,
        transparent = false,
        opacity = 1.0,
        color = 0x3286cd,
    } = matDef;

    let map = null;

    if(texturePath !== null) {
        if (!context.textureLoader)
            throw new Error(
                "Texture is required for mesh material, but there is no texture loader in the context."
            );
        map = context.textureLoader.load(texturePath);
    }

    return new THREE.MeshBasicMaterial({
        color,
        map,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        wireframe,
        transparent: transparent || opacity < 1.0,
        opacity,
    });
}

