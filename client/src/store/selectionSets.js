export function cloneMarkerMap(markers) {
  return new Map(
    [...markers].map(([geoID, indices]) => [
      geoID,
      new Set(indices)
    ])
  );
}

export function cloneSelection(selection) {
  return {
    geoItemIDs: new Set(selection.geoItemIDs),
    markers: cloneMarkerMap(selection.markers)
  };
}

export function emptySelection() {
  return {
    geoItemIDs: new Set(),
    markers: new Map()
  };
}

export function normalizeSelectionAsset(asset) {
  return {
    geoItemIDs: new Set(asset?.geoItemIDs ?? []),

    markers: new Map(
      Object.entries(asset?.markers ?? {}).map(
        ([geoID, indices]) => [
          geoID,
          new Set(indices)
        ]
      )
    )
  };
}

export function serializeSelection(selection) {
  return {
    geoItemIDs: [...selection.geoItemIDs].sort(),

    markers: Object.fromEntries(
      [...selection.markers]
        .filter(([, indices]) => indices.size !== 0)
        .sort(([lhs], [rhs]) => lhs.localeCompare(rhs))
        .map(([geoID, indices]) => [
          geoID,
          [...indices].sort((a, b) => a - b)
        ])
    )
  };
}

function unionSets(lhs, rhs) {
  return new Set([...lhs, ...rhs]);
}

function subtractSets(lhs, rhs) {
  return new Set(
    [...lhs].filter(value => !rhs.has(value))
  );
}

function intersectSets(lhs, rhs) {
  return new Set(
    [...lhs].filter(value => rhs.has(value))
  );
}

function combineMarkerMaps(lhs, rhs, operation) {
  const result = new Map();
  const geoIDs = new Set([
    ...lhs.keys(),
    ...rhs.keys()
  ]);

  for (const geoID of geoIDs) {
    const lhsIndices = lhs.get(geoID) ?? new Set();
    const rhsIndices = rhs.get(geoID) ?? new Set();
    const indices = operation(lhsIndices, rhsIndices);

    if (indices.size !== 0)
      result.set(geoID, indices);
  }

  return result;
}

export function unionSelections(lhs, rhs) {
  return {
    geoItemIDs: unionSets(
      lhs.geoItemIDs,
      rhs.geoItemIDs
    ),

    markers: combineMarkerMaps(
      lhs.markers,
      rhs.markers,
      unionSets
    )
  };
}

export function subtractSelections(lhs, rhs) {
  return {
    geoItemIDs: subtractSets(
      lhs.geoItemIDs,
      rhs.geoItemIDs
    ),

    markers: combineMarkerMaps(
      lhs.markers,
      rhs.markers,
      subtractSets
    )
  };
}

export function intersectSelections(lhs, rhs) {
  return {
    geoItemIDs: intersectSets(
      lhs.geoItemIDs,
      rhs.geoItemIDs
    ),

    markers: combineMarkerMaps(
      lhs.markers,
      rhs.markers,
      intersectSets
    )
  };
}
