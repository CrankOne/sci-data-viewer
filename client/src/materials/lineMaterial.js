import * as THREE from "three";

export const type = "LineMaterial";

export function make_material(matDef, context={}) {
    const {
            lineStrokeType = null,
            color = 0xff7777,
            linewidth = 1,
            scale = 1,
            dashSize = 3,  // < NOTE: does not work for three.js
            gapSize = 1,
            vertexColors = true
            // ...other default properties
        } = matDef;
    if(matDef.lineStrokeType == "solid" || !matDef.lineStrokeType)
        return new THREE.LineBasicMaterial({
                color,
                vertexColors,
                linewidth
            });
    else if(matDef.lineStrokeType == "dashed")
        return new THREE.LineDashedMaterial({
                color,
                linewidth,
                scale, dashSize, gapSize
            });
    else
        throw new Error(`Unknown line stroke type "${matDef.lineStrokeType}"`);
}

