// Registers a minimal "journal" viewer module (see ../registry.js) -- a
// leaf panel listing plain-text log messages forwarded via the cross
// -module "selection sink" mechanism (doc/ui-session.rst's "Extension
// points"), e.g. a block-diagram edge's own per-transition log lines
// (na64umff.py's `journal` subjectData aspect, na64utils-msadc's
// LogRecord/add_procedure_log_line C++ machinery -- doc/module-journal.rst).
// Importing this file for its side effect is enough to make the "journal"
// data type known to the app -- see main.js.
//
// Deliberately minimal for now (doc/module-journal.rst's own framing:
// "nothing special, just a leaf panel for plain text for a while"): no
// directly-loadable source, no selection module of its own -- sink target
// only. Expected to grow into a three-column (time/severity/message) table
// with its own per-row payload/facets later; not designed here.

import { register_module } from '../registry';

import JournalViewport from './JournalViewport.vue';
import { make_sink_inbox_module } from '@/store/sinkInbox';

register_module({
    dataType: 'journal',
    label: 'Journal',
    viewportComponent: JournalViewport,
    contextual: true,
    contextStoreModules: {
        sinkInbox: make_sink_inbox_module
    },
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    // Only ever receives data via the sink mechanism for now (a graph
    // edge's own subjectData.journal) -- no directly-loadable "journal"
    // source exists yet, unlike graph/plot (doc/module-journal.rst's
    // "Data"); add one later if a whole-event log independent of any one
    // edge turns out to be wanted too.
    acceptsPayloadTypes: ['journal'],
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
});
