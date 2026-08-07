import * as THREE from "three";
import * as Shaders from "../shaders";

export const type = "ColoredLineShaderMaterial";

export function make_material(matDef, context={}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_resolution: {type: 'v2', value: {x: 828, y: 955}},  // TODO: reactive?
            u_dashSize: {type: 'f', value: 3.0},
            u_gapSize: {type: 'f', value: 5.0},
            u_color: {type: 'v3', value: {x: 0.8, y: 0.7, z: 0.7}}
        },
        vertexShader: Shaders.dashedLine.startPointVertexShader,
        fragmentShader: Shaders.dashedLine.dashedLineFragmentShader,
        vertexColors: true
    });
}
