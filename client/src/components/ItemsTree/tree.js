function compareLabels(lhs, rhs) {
  return String(lhs).localeCompare(String(rhs), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

export function normalizedFacetValue(item, facetName) {
  const value = item.facets?.[facetName];

  if (value === undefined || value === null || value === "")
    return "(unspecified)";

  if (Array.isArray(value))
    return value.join(", ");

  return String(value);
}

function makeGroupNode({
  key,
  label,
  facet,
  facetValue
}) {
  return {
    kind: "group",
    key,
    label,
    facet,
    facetValue,
    children: []
  };
}

function makeItemNode(item) {
  return {
    kind: "item",
    key: `item/${item.id}`,
    item
  };
}

function sortTree(nodes) {
  nodes.sort((lhs, rhs) => {
    if (lhs.kind !== rhs.kind)
      return lhs.kind === "group" ? -1 : 1;

    const lhsLabel =
      lhs.kind === "group" ? lhs.label : lhs.item.label;

    const rhsLabel =
      rhs.kind === "group" ? rhs.label : rhs.item.label;

    return compareLabels(lhsLabel, rhsLabel);
  });

  for (const node of nodes) {
    if (node.kind === "group")
      sortTree(node.children);
  }

  return nodes;
}

export function buildFacetTree(items, activeFacets) {
  if (activeFacets.length === 0) {
    return items
      .map(makeItemNode)
      .sort((lhs, rhs) =>
        compareLabels(lhs.item.label, rhs.item.label)
      );
  }

  const roots = [];
  const groupMaps = activeFacets.map(() => new Map());

  for (const item of items) {
    let children = roots;
    let path = "";

    for (
      let depth = 0;
      depth < activeFacets.length;
      ++depth
    ) {
      const facet = activeFacets[depth];
      const value = normalizedFacetValue(item, facet);

      path +=
        `/${encodeURIComponent(facet)}` +
        `=${encodeURIComponent(value)}`;

      let group = groupMaps[depth].get(path);

      if (!group) {
        group = makeGroupNode({
          key: `group${path}`,
          label: value,
          facet,
          facetValue: value
        });

        groupMaps[depth].set(path, group);
        children.push(group);
      }

      children = group.children;
    }

    children.push(makeItemNode(item));
  }

  return sortTree(roots);
}

export function collectGroupKeys(nodes) {
  const result = [];

  function visit(currentNodes) {
    for (const node of currentNodes) {
      if (node.kind !== "group")
        continue;

      result.push(node.key);
      visit(node.children);
    }
  }

  visit(nodes);
  return result;
}

export function collectItemIDs(nodeOrNodes) {
  const result = [];
  const nodes = Array.isArray(nodeOrNodes)
    ? nodeOrNodes
    : [nodeOrNodes];

  function visit(currentNodes) {
    for (const node of currentNodes) {
      if (node.kind === "item") {
        result.push(node.item.id);
      } else {
        visit(node.children);
      }
    }
  }

  visit(nodes);
  return result;
}

export function collectHighlightedGroupKeys(nodes, highlightedIDs) {
  const groupKeys = new Set();

  function visit(node) {
    if (node.kind === "item")
      return highlightedIDs.has(node.item.id);

    let containsHighlightedItem = false;

    for (const child of node.children) {
      if (visit(child))
        containsHighlightedItem = true;
    }

    if (containsHighlightedItem)
      groupKeys.add(node.key);

    return containsHighlightedItem;
  }

  for (const node of nodes)
    visit(node);

  return groupKeys;
}
