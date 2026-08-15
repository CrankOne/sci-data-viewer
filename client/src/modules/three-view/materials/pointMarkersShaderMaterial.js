import * as THREE from "three";
import * as Markers from "../markers";

export const type = "PointMarkersShaderMaterial";

export function make_material(matDef, context={}) {
    return Markers.get_marker_shader_material(matDef);
}

export function make_mask_material(matDef_, context={}) {
    // BUGFIX: this used to force flags=0x3 (suppress the shape's own
    // stroke, fill only -- see the 0x1/0x2 bits in ../markers.js's
    // draw_texture). That's silently blank for any "open" marker shape
    // whose drawing callback traces disconnected line segments with no
    // enclosed area (e.g. "xCross": two crossing strokes) -- Canvas 2D's
    // fill() treats each subpath as implicitly closed for the purpose of
    // filling, but a single line segment "closed" back on itself still
    // encloses zero area, so fill() draws nothing. The effect: hover/
    // selection state was updated correctly (this._geometryManager.
    // update_highlighted_markers/update_highlighted_graphics both fire,
    // `.visible` toggles correctly) but the rendered highlight/selected
    // overlay was invisible -- looking exactly like "markers don't react
    // to hover" despite the underlying mechanism working.
    // flags=0x2 (fill only *without* suppressing the stroke -- 0x1 is not
    // set) keeps the shape's own stroke -- the same rendering that
    // already makes the *base* marker visible in the first place (base
    // markers use flags=0x0 by default, which also draws the stroke) --
    // and additionally fills the shape where its path *does* enclose an
    // area (e.g. "hollowXCross", "filledCircle"), for a bolder mask.
    // Always non-blank, regardless of shape.
    const matDef = {flags: 0x2, ...matDef_};
    return Markers.get_marker_shader_material(matDef);
}
