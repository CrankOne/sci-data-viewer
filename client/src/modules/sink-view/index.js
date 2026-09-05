// Registers the JSON viewer as a client-side viewer module (see ../
// registry.js). Started as a throwaway stub proving the cross-module
// "selection sink" mechanism end to end (doc/ui-session.rst's "Extension
// points") -- now a real, generic module in its own right: a read-only
// tree display of whatever payload type lands here (`acceptsPayloadTypes:
// '*'`, modules/registry.js's "anticipate a module accepting all types"
// case), with its own selection/forwarding side so a picked item (or a
// handful, for building a curated test-data set) can be routed onward --
// e.g. through a store/modules/transforms.js transform -- same as any other
// contextual module. Deliberately still not the real Tabular View module
// (doc/module-table.rst) -- that one renders typed rows/columns; this one
// stays payload-shape-agnostic on purpose. Importing this file for its
// side effect is enough to make the "sink-view" data type known to the app
// -- see main.js.
import { register_module } from '../registry';

import SinkViewport from './SinkViewport.vue';
import { make_sink_inbox_module } from '@/store/sinkInbox';
import { make_selection_module } from '@/store/selection';
import { resolve_origin } from '@/store/originResolve';
import { make_selection_id, destruct_selection_id } from './ids';

register_module({
    dataType: 'sink-view',
    label: 'JSON Viewer',
    scopeNoun: 'viewer',
    viewportComponent: SinkViewport,
    contextual: true,
    contextStoreModules: {
        sinkInbox: make_sink_inbox_module,
        // Generic per-context item-selection state (doc/ui-session.rst's
        // "Selection model") -- same fixed `selection` entry every other
        // contextual module registers under. Selecting here means
        // "checked" in SinkViewport.vue's own per-item checkbox, since
        // there's no generic click-to-select hook into jjsontree.js's own
        // rendered tree to hang this off of (SinkInboxEntry.vue already
        // treats that library as an opaque, read-only display).
        selection: make_selection_module
    },
    // No `sink-view`-typed data source ever exists -- this module only
    // ever receives data via the sink mechanism (store/sinkDispatch.js),
    // never connection.js's resource-fetch pipeline.
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    acceptsPayloadTypes: '*',
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`,
    // Sink *origin* too: forwards whichever landed item(s) are checked in
    // SinkViewport.vue. Transparent for typing/provenance purposes, same
    // principle store/originResolve.js's transform-as-origin uses --
    // `payloadType`/`srcID` are the *original* upstream item's own, not
    // something new this module invents, so a receiver downstream sees
    // exactly what it would have seen picking the item at its real origin
    // directly. `resolve_selected_item` below is the one place that knows
    // how to turn this module's own composite selection id (ids.js) back
    // into a live item -- shared by buildSinkSnapshot and resolveSinkItem
    // so there's exactly one lookup to keep correct.
    buildSinkSnapshot(store, contextId) {
        const selectedIds = store.getters[`selection_${contextId}/selectedItemIDs`];
        return [...selectedIds].flatMap(compositeId => resolve_selected_item(store, contextId, compositeId) ?? []);
    },
    resolveSinkItem(store, contextId, originRef) {
        return resolve_selected_item(store, contextId, originRef);
    }
});

// `compositeId` names one already-landed sink item: which origin it came
// from, plus that origin's own originRef (ids.js). Returns null once
// either the origin itself is gone (removeIncomingOrigin already dropped
// its whole entry) or the item is -- same "resolves to nothing once gone"
// contract every other module's own resolve_selected_item follows, which
// is what makes a forwarded-from-here item stop displaying itself once its
// *original* origin disappears, not just this module's own inbox entry.
//
// Deliberately calls the origin's own `resolveSinkItem` directly for just
// this one `originRef`, rather than store/sinkResolve.js's own
// resolve_incoming_sink_items(store, [entry]) (which resolves *every* item
// in the entry, then picks one back out by originRef) -- fine for that
// function's other callers, which all want the whole batch for display
// anyway, but ruinous here: this runs once per *selected* composite id,
// on every single inbox update (prune_selection_after_inbox_update, store/
// sinkAutoDispatch.js), and when the origin is a transform (store/
// originResolve.js's make_transform_origin), each resolution re-executes
// the transform's own function from scratch over its *entire* current feed
// set. Resolving every item in the entry just to keep one turns that into
// one full transform re-run per item ever delivered in the same batch, on
// top of one per currently-selected id -- quadratic in the batch size, and
// exactly what made a transform combining a selection feed with a resource
// feed (merging two origins' worth of items into one entry) feel like it
// hung the page once a handful of items had been selected here.
function resolve_selected_item(store, contextId, compositeId) {
    const {originContextId, originRef} = destruct_selection_id(compositeId);
    const entry = store.getters[`sinkInbox_${contextId}/incomingList`].find(e => e.originContextId === originContextId);
    if(!entry?.items.some(ref => ref.originRef === originRef)) return null;

    const originModule = resolve_origin(store, originContextId);
    const resolved = originModule?.resolveSinkItem?.(store, originContextId, originRef);
    if(!resolved) return null;

    return {
        itemId: resolved.itemId, srcID: originContextId, originRef: compositeId,
        payloadType: resolved.payloadType, snapshot: resolved.snapshot
    };
}
