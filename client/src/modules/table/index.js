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
    // Same {mutation, payload} shape connection.js's RESOURCE_TYPE_HANDLERS
    // used to hardcode -- now owned by the module instead of by core.
    // A function of the resource's contextId, since tableDesk is registered
    // per-context rather than under one fixed namespace.
    payloadMutation: contextId => `tableDesk_${contextId}/update_table_data`,
    payload(resource, data) {
        // `data` is the raw fetched body -- doc/module-table.rst's
        // "tableData" envelope ({schema, rows}, plus `total` when the
        // source is row-windowed, doc/sources.rst's "Row-window
        // pagination" -- falls back to this (first) page's own row count
        // for a source that isn't, so a local table's `total` is correct
        // without the source needing to declare one itself).
        const table = data?.tableData ?? null;
        return {
            name: resource.name,
            table: table && {...table, total: table.total ?? table.rows?.length ?? 0}
        };
    },
    // Mirrors payloadMutation/payload, for dropping a resource's data from
    // a context it's leaving (removed, or reassigned to a different table
    // scene -- see connection.js's remove_resource/reassign_resource_context).
    removeMutation: contextId => `tableDesk_${contextId}/remove_table_data`,
    removePayload(resource) {
        return resource.name;
    },
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
});
