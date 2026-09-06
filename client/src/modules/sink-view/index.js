// Registers the JSON viewer as a client-side viewer module (see ../
// registry.js). Started as a throwaway stub proving the cross-module
// "selection sink" mechanism end to end (doc/ui-session.rst's "Extension
// points") -- now a real, generic module in its own right: a read-only tree
// display of whatever payload type lands here (`acceptsPayloadTypes: '*'`,
// modules/registry.js's "anticipate a module accepting all types" case).
// Deliberately still not the real Tabular View module (doc/module-table
// .rst) -- that one renders typed rows/columns; this one stays
// payload-shape-agnostic on purpose. Importing this file for its side
// effect is enough to make the "sink-view" data type known to the app --
// see main.js.
//
// Sink *target* only, not also an origin: an earlier version let a
// per-item checkbox forward a landed item back out through its own sink
// link, meant as a stand-in for jjsontree.js's own inline node-selection
// (which SinkInboxEntry.vue already treats as an opaque, read-only display
// -- there's no click-to-select hook into the library's rendered tree to
// hang a real selection off of). Dropped once that stand-in itself turned
// out to have no real use -- forwarding the checked *raw item* was never
// the point of browsing a landed payload as JSON. If a real inline
// -selection-driven forward is wanted later, it belongs on top of
// jjsontree.js's own selection API directly, not resurrected as a checkbox.
import { register_module } from '../registry';

import SinkViewport from './SinkViewport.vue';
import { make_sink_inbox_module } from '@/store/sinkInbox';

register_module({
    dataType: 'sink-view',
    label: 'JSON Viewer',
    scopeNoun: 'viewer',
    viewportComponent: SinkViewport,
    contextual: true,
    contextStoreModules: {
        sinkInbox: make_sink_inbox_module
    },
    // No `sink-view`-typed data source ever exists -- this module only
    // ever receives data via the sink mechanism (store/sinkDispatch.js),
    // never connection.js's resource-fetch pipeline.
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    acceptsPayloadTypes: '*',
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
});
