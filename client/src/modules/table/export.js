// CSV export (doc/module-table.rst's "Export": "for local tables, CSV
// should be supported directly in the client"). Only ever called for a
// source declaring `capabilities.export` (currently just `local` --
// sources/local.js -- matching the doc's own scoping of this to local
// tables, not "arbitrary large datasets").

// RFC 4180-style escaping: quote a field containing a comma, quote, or
// line break, doubling any quote it already contains.
function csv_cell(value) {
    if(value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// `columns` is a flat leaf-column list (schema.js's leaf_columns()) --
// hierarchical grouping doesn't survive into CSV, which has no concept of
// it; the header row uses each leaf's own label/id, not its group path.
export function to_csv(columns, rows) {
    const header = columns.map(col => csv_cell(col.label ?? col.id)).join(',');
    const body = rows.map(row => columns.map(col => csv_cell(row[col.id])).join(','));
    return [header, ...body].join('\r\n');
}
