// Utilities specific to the 3D viewer module (item addressing scheme and
// three.js render-layer constants). Generic helpers (theme/color reading)
// live in the core `@/utils.js` instead -- see that file for why.

export function set_difference(a, b) {
    const out = new Set();
    for(const x of a) {
        if(!b.has(x))
            out.add(x);
    }
    return out;
}

export const GEO_KEY_DELIMITER = '@';

// used to stringify srcID+geoID pairs into keys since JS does not have tuples
// for Set()
export function full_geo_id(srcID, geoID) { return `${geoID}${GEO_KEY_DELIMITER}${srcID}`; }

// returns [srcID, geoID]
export function destruct_geo_id(itemID) {
    const p = itemID.indexOf('@');
    return [itemID.slice(p + 1), itemID.slice(0, p)];
}

// Used to highlight geometry entities by maintaining copy objects
export const LAYER_MAIN = 0;
export const LAYER_MASK_HIGHLIGHTED = 1;
export const LAYER_MASK_SELECTED = 2;
