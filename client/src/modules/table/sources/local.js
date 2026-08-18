// "Local" TableDataSource (doc/module-table.rst's "Row access"): the whole
// table is already resident -- arrived via the normal connection.js
// payload pipeline into tableDesk (modules/table/store/tableDesk.js) in one
// shot, nothing left to fetch. The simplest random-access source, per the
// doc: "A local table should be treated as the simplest random-access
// source rather than as a separate widget type" -- it still implements the
// same fetch_range() interface, just synchronously satisfied from the
// array already in memory. Sorting (doc's "Sorting": "for local tables,
// sorting may be performed locally") happens here too, client-side.

// Only the first entry of a sort spec (see controller.js) is applied --
// composing several keys would just chain comparisons the same way, not
// yet needed by anything exercising this.
function compare_rows(a, b, {column, direction}) {
    const av = a[column], bv = b[column];
    const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
    return direction === 'desc' ? -cmp : cmp;
}

export function make_local_source({rows}) {
    let orderedRows = rows;

    return {
        kind: 'local',
        capabilities: {
            randomAccess: true,
            sequential: false,
            finite: true,
            sort: true,
            pivot: false,
            plot: true,
            export: true
        },
        set_sort(spec) {
            orderedRows = spec?.length ? [...rows].sort((a, b) => compare_rows(a, b, spec[0])) : rows;
        },
        async fetch_range(start, count) {
            return {rows: orderedRows.slice(start, start + count), total: orderedRows.length};
        }
    };
}
