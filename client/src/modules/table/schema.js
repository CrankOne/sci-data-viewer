// Column-tree utilities (doc/module-table.rst's "Schema and columns"): a
// schema's `columns` is a tree, not a flat list -- each entry is either a
// leaf (`{id, label, type, units, ...}`) or a group (`{label, children:
// [...]}`, no `id` of its own). Leaf ids are flat, stable strings (e.g.
// `"fitted.x"`), never derived from nesting depth or position, so column
// reordering/regrouping never invalidates a row's own keys or a live cell
// selection (doc's "Selection" section).
//
// Mixed depth is expected and supported: a top-level leaf (e.g. an index
// column) may sit alongside a deeper group in the same schema -- see
// header_rows()'s rowSpan handling below.

function is_group(column) {
    return Array.isArray(column.children);
}

// Drops hidden leaves (doc/module-table.rst's "Table state": column
// visibility is view state, not a schema/dataset concern) and any group
// left with no visible children, without otherwise reshaping the tree --
// header_rows()'s colspan/rowspan math then naturally accounts for
// visibility with no separate logic of its own.
export function filter_columns(columns, isVisible) {
    return columns.flatMap(column => {
        if(is_group(column)) {
            const children = filter_columns(column.children, isVisible);
            return children.length ? [{...column, children}] : [];
        }
        return isVisible(column.id) ? [column] : [];
    });
}

// Every leaf column, depth-first, in schema order -- what a row's cells
// are rendered/keyed against (one per leaf, regardless of grouping).
export function leaf_columns(columns) {
    return columns.flatMap(column => is_group(column) ? leaf_columns(column.children) : [column]);
}

function column_height(column) {
    return is_group(column) ? 1 + Math.max(...column.children.map(column_height)) : 1;
}

// Tree height (deepest leaf's nesting level + 1) -- the number of header
// rows needed to render every group label above its own leaves.
export function tree_depth(columns) {
    if(columns.length === 0) return 1;
    return Math.max(...columns.map(column_height));
}

// Builds one array of header cells per header row, each cell carrying the
// colspan/rowspan a plain <th> needs. A leaf at a shallower level than the
// tree's own depth rowspans down through the remaining rows (e.g. a
// top-level leaf alongside a 2-deep group spans both header rows) rather
// than leaving a gap under it.
export function header_rows(columns) {
    const depth = tree_depth(columns);
    const rows = Array.from({length: depth}, () => []);

    function walk(cols, level) {
        for(const column of cols) {
            if(is_group(column)) {
                rows[level].push({
                    key: `group:${level}:${column.label}`,
                    label: column.label,
                    colSpan: leaf_columns([column]).length,
                    rowSpan: 1
                });
                walk(column.children, level + 1);
            } else {
                rows[level].push({
                    key: `leaf:${column.id}`,
                    label: column.label ?? column.id,
                    units: column.units,
                    colSpan: 1,
                    rowSpan: depth - level,
                    id: column.id
                });
            }
        }
    }

    walk(columns, 0);
    return rows;
}
