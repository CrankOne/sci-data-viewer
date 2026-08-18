// Generic selection-set algebra: union/subtract/intersect/normalize/
// serialize/clone over a {itemIDs: Set, subItems: Map<itemID, Set<index>>}
// selection shape. Field-name-neutral (doc/ui-session.rst's "Selection
// model") -- shared by any contextual module's `selection` context module
// (store/selection.js), not specific to geo3d. Was
// modules/three-view/store/selectionSets.js, generalized off its
// geo3d-specific `geoItemIDs`/`markers` field names.
export function clone_index_map(subItems) {
    return new Map([...subItems].map(([itemID, indices]) => [itemID, new Set(indices)]));
}

export function clone_selection(selection) {
    return {
        itemIDs: new Set(selection.itemIDs),
        subItems: clone_index_map(selection.subItems)
    };
}

export function empty_selection() {
    return {
        itemIDs: new Set(),
        subItems: new Map()
    };
}

export function normalize_selection_asset(asset) {
    return {
        itemIDs: new Set(asset?.itemIDs ?? []),

        subItems: new Map(
            Object.entries(asset?.subItems ?? {}).map(([itemID, indices]) => [itemID, new Set(indices)])
        )
    };
}

// Sub-item values are whatever a consumer's own type uses for "index within
// an item" -- numeric point-cloud indices (three-view) today, but nothing
// in this shared module requires that; a string columnId (a future tabular
// module's cell selection, doc/ui-session.rst's "Selection model") is
// equally valid. Numeric compare when both sides actually are numbers,
// string compare otherwise, rather than assuming numeric.
function compare_sub_item_values(lhs, rhs) {
    if(typeof lhs === "number" && typeof rhs === "number") return lhs - rhs;
    return String(lhs).localeCompare(String(rhs));
}

export function serialize_selection(selection) {
    return {
        itemIDs: [...selection.itemIDs].sort(),

        subItems: Object.fromEntries(
            [...selection.subItems]
                .filter(([, indices]) => indices.size !== 0)
                .sort(([lhs], [rhs]) => lhs.localeCompare(rhs))
                .map(([itemID, indices]) => [itemID, [...indices].sort(compare_sub_item_values)])
        )
    };
}

function union_sets(lhs, rhs) {
    return new Set([...lhs, ...rhs]);
}

function subtract_sets(lhs, rhs) {
    return new Set([...lhs].filter(value => !rhs.has(value)));
}

function intersect_sets(lhs, rhs) {
    return new Set([...lhs].filter(value => rhs.has(value)));
}

function combine_index_maps(lhs, rhs, operation) {
    const result = new Map();
    const itemIDs = new Set([...lhs.keys(), ...rhs.keys()]);

    for(const itemID of itemIDs) {
        const lhsIndices = lhs.get(itemID) ?? new Set();
        const rhsIndices = rhs.get(itemID) ?? new Set();
        const indices = operation(lhsIndices, rhsIndices);

        if(indices.size !== 0)
            result.set(itemID, indices);
    }

    return result;
}

export function union_selections(lhs, rhs) {
    return {
        itemIDs: union_sets(lhs.itemIDs, rhs.itemIDs),
        subItems: combine_index_maps(lhs.subItems, rhs.subItems, union_sets)
    };
}

export function subtract_selections(lhs, rhs) {
    return {
        itemIDs: subtract_sets(lhs.itemIDs, rhs.itemIDs),
        subItems: combine_index_maps(lhs.subItems, rhs.subItems, subtract_sets)
    };
}

export function intersect_selections(lhs, rhs) {
    return {
        itemIDs: intersect_sets(lhs.itemIDs, rhs.itemIDs),
        subItems: combine_index_maps(lhs.subItems, rhs.subItems, intersect_sets)
    };
}
