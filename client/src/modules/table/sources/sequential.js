// "Sequential" TableDataSource -- shape only, per doc/module-table.rst's
// instruction that "sequential browsing... should be supported by the
// architecture from the beginning, but may follow in subsequent
// implementation stages." No real backend or UI exercises this yet (see
// the doc's "Open questions"); it exists so controller.js has something
// uniform to dispatch to once a sequential tabular source is designed,
// rather than a special case bolted on later.
export function make_sequential_source() {
    return {
        kind: 'sequential',
        capabilities: {
            randomAccess: false,
            sequential: true,
            finite: false,
            sort: false,
            pivot: false,
            plot: false,
            export: false
        },
        async fetch_next() {
            throw new Error('Sequential tabular sources are not implemented yet');
        }
    };
}
