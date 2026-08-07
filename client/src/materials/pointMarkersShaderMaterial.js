import * as THREE from "three";
import * as Markers from "../markers";

export const type = "PointMarkersShaderMaterial";

export function make_material(matDef, context={}) {
    return Markers.get_marker_shader_material(matDef);
}

export function make_mask_material(matDef_, context={}) {
    const matDef = {flags: 0x3, ...matDef_};  // always filled
    return Markers.get_marker_shader_material(matDef);
}
