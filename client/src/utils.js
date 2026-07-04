// Various utilities (occasionally, some of them might be found in libraries
// like lodash, etc).

// Split array onto sub-arrays, based on the field value of objects
//  see: https://stackoverflow.com/a/60835733/1734499
export function group_by(arr, property) {
  return arr.reduce((acc, cur) => {
    acc[cur[property]] = [...acc[cur[property]] || [], cur];
    return acc;
  }, {});
}

export function set_difference(a, b) {
    const out = new Set();
    for(const x of a) {
        if(!b.has(x))
            out.add(x);
    }
    return out;
}

export const GEO_KEY_DELIMITER='@';

// used to stringify srcID+geoID pairs into keys since JS does not have tuples
// for Set()
export function full_geo_id(srcID, geoID) { return `${geoID}${GEO_KEY_DELIMITER}${srcID}`; }

// returns [srcID, geoID]
export function destruct_geo_id(itemID) {
    const p = itemID.indexOf('@');
    return [ itemID.slice(p + 1), itemID.slice(0, p) ];
}

//
// Colors

// asks the browser to paint the value into a temporary element, then reads the
// resolved color back.
// TODO: this is rather crude kludge, substitute with 3rd-party function/lib
// or native JS mean if will become available.
function resolve_css_color(value) {
    const el = document.createElement("span");
    el.style.color = value;
    el.style.display = "none";
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).color;
    document.body.removeChild(el);
    return resolved; // usually "rgb(...)" or "rgba(...)"
}

function normalize_hex(hex) {
    if (hex.length === 4) {
        return "#" + [...hex.slice(1)]
            .map(ch => ch + ch)
            .join("");
    }
    return hex.toLowerCase();
}

function clamp255(x) {
    return Math.max(0, Math.min(255, Math.round(x)));
}

function rgb_to_hex(r, g, b) {
    return "#" + [r, g, b]
        .map(x => clamp255(x).toString(16).padStart(2, "0"))
        .join("");
}

function css_color_to_hex(value) {
    const resolved = resolve_css_color(value).trim();
    // rgb(84, 94, 98) or rgba(84, 94, 98, 0.5)
    let m = resolved.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
    if(m) return rgb_to_hex(+m[1], +m[2], +m[3]);

    // color(srgb 0.331765 0.369412 0.385098)
    m = resolved.match(
        /^color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i
    );
    if(m) {
        return rgb_to_hex(
            Math.round(+m[1] * 255),
            Math.round(+m[2] * 255),
            Math.round(+m[3] * 255)
        );
    }
    // #abc or #aabbcc
    m = resolved.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) return normalize_hex(resolved);
    throw new Error(`Cannot parse CSS color: ${resolved}`);
}

function css_var(name, { resolveColor = true } = {}) {
    const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return resolveColor ? css_color_to_hex(v) : v;
}

export function get_theme() {
    return {
        background : css_var('--clr-neutral'),
        grid1      : css_var('--clr-graph-grid1'),
        grid2      : css_var('--clr-graph-grid2'),
        annotations: css_var('--clr-graph-annotations'),
        annotations_mute: css_var('--clr-graph-annotations-mute'),
        geometry   : css_var('--clr-graph-annotations-lighter'),
        selected   : css_var('--clr-graph-selection'),
    };
}

// Used to highlight geometry entities by maintaining copy objects
export const LAYER_MAIN = 0;
export const LAYER_MASK_HIGHLIGHTED = 1;
export const LAYER_MASK_SELECTED = 2;
