// Registers a minimal, deliberately throwaway viewer module as a client
// -side sink *target* for the cross-module "selection sink" mechanism
// (doc/ui-session.rst's "Extension points"). Exists purely to prove that
// mechanism end to end -- it is NOT a step toward the real Tabular View
// module (doc/module-table.rst), which doesn't exist in this codebase yet
// and is a separate, much larger project. Importing this file for its side
// effect is enough to make the "sink-view" data type known to the app --
// see main.js.

import { register_module } from '../registry';

import SinkViewport from './SinkViewport.vue';
import { make_sink_inbox_module } from '@/store/sinkInbox';

register_module({
    dataType: 'sink-view',
    label: 'Sink Inbox (dev)',
    viewportComponent: SinkViewport,
    contextual: true,
    contextStoreModules: {
        sinkInbox: make_sink_inbox_module
    },
    // Deliberately no payloadMutation/payload/removeMutation/removePayload
    // -- this module never receives data via connection.js's resource-fetch
    // pipeline; sink dispatch is separate plumbing (store/sinkDispatch.js).
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    // The whole point of this dev stub: prove any payload type can land
    // here, unstyled -- modules/registry.js's "anticipate a module
    // accepting all types" case.
    acceptsPayloadTypes: '*',
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
});
