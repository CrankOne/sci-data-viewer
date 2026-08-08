export function clone_marker_map(markers) {
    return new Map([...markers].map(([geoID, indices]) => [geoID, new Set(indices)]));
}

export function clone_selection(selection) {
    return {
        geoItemIDs: new Set(selection.geoItemIDs),
        markers: clone_marker_map(selection.markers)
    };
}

export function empty_selection() {
    return {
        geoItemIDs: new Set(),
        markers: new Map()
    };
}

export function normalize_selection_asset(asset) {
    return {
        geoItemIDs: new Set(asset?.geoItemIDs ?? []),

        markers: new Map(
            Object.entries(asset?.markers ?? {}).map(([geoID, indices]) => [geoID, new Set(indices)])
        )
    };
}

export function serialize_selection(selection) {
    return {
        geoItemIDs: [...selection.geoItemIDs].sort(),

        markers: Object.fromEntries(
            [...selection.markers]
                .filter(([, indices]) => indices.size !== 0)
                .sort(([lhs], [rhs]) => lhs.localeCompare(rhs))
                .map(([geoID, indices]) => [geoID, [...indices].sort((a, b) => a - b)])
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

function combine_marker_maps(lhs, rhs, operation) {
    const result = new Map();
    const geoIDs = new Set([...lhs.keys(), ...rhs.keys()]);

    for(const geoID of geoIDs) {
        const lhsIndices = lhs.get(geoID) ?? new Set();
        const rhsIndices = rhs.get(geoID) ?? new Set();
        const indices = operation(lhsIndices, rhsIndices);

        if(indices.size !== 0)
            result.set(geoID, indices);
    }

    return result;
}

export function union_selections(lhs, rhs) {
    return {
        geoItemIDs: union_sets(lhs.geoItemIDs, rhs.geoItemIDs),
        markers: combine_marker_maps(lhs.markers, rhs.markers, union_sets)
    };
}

export function subtract_selections(lhs, rhs) {
    return {
        geoItemIDs: subtract_sets(lhs.geoItemIDs, rhs.geoItemIDs),
        markers: combine_marker_maps(lhs.markers, rhs.markers, subtract_sets)
    };
}

export function intersect_selections(lhs, rhs) {
    return {
        geoItemIDs: intersect_sets(lhs.geoItemIDs, rhs.geoItemIDs),
        markers: combine_marker_maps(lhs.markers, rhs.markers, intersect_sets)
    };
}
