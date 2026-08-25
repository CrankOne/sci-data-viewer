// Registers the tabular view as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "table" data type known to the app -- see main.js.

import { register_module } from '../registry';

import TableViewport from './TableViewport.vue';
import { make_table_desk_module } from './store/tableDesk';
import { make_sink_inbox_module } from '@/store/sinkInbox';
import { make_selection_module } from '@/store/selection';

register_module({
    dataType: 'table',
    label: 'Table',
    viewportComponent: TableViewport,
    contextual: true,
    contextStoreModules: {
        tableDesk: make_table_desk_module,
        // The "Selection view" use case (doc/module-table.rst): this
        // module is a real sink *target*, the same mechanism
        // modules/sink-view/'s dev stub proves in isolation, sharing the
        // same factory (store/sinkInbox.js) rather than a second copy.
        sinkInbox: make_sink_inbox_module,
        // Row/cell selection (doc/module-table.rst's "Selection"): the
        // generic `selection` context module three-view already uses --
        // row -> selectedItemIDs (row id = item id), cell -> selectedSubItems
        // keyed by row id with the column id as the sub-item value. Fixed
        // key name, same as three-view's own registration, so
        // contexts.js's install_selection_persistence picks it up
        // generically and this context gets facet-preset/selection-set
        // persistence for free.
        selection: make_selection_module
    },
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    // Doesn't discriminate what it receives -- the "Selection view" section
    // (TableViewport.vue) renders whatever lands, origin-agnostic (doc/
    // module-table.rst has no shape requirement of its own for incoming
    // items).
    acceptsPayloadTypes: '*',
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
    // No buildSinkSnapshot: this module isn't a sink origin. It used to
    // dispatch a column projection ("Plot dispatch") outside the selection
    // mechanism entirely; that's been pulled out (doc/module-table.rst's
    // "Plot dispatch" is postponed, not redesigned yet).
});
