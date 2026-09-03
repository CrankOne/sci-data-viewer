// Registers the 2D plotter as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "plot" data type known to the app -- see main.js.

import { register_module } from '../registry';
import { CATEGORY_COMMON_SCOPE } from '@/modules/panelItems';

import PlotViewport from './PlotViewport.vue';
import PlotHelpersPanel from './PlotHelpersPanel.vue';
import DataGroupsPanel from './DataGroupsPanel.vue';
import { make_plot_desk_module, resolve_forwarded_primitives } from './store/plotDesk';
import { make_sink_inbox_module } from '@/store/sinkInbox';
import { make_selection_module } from '@/store/selection';

register_module({
    dataType: 'plot',
    label: '2D Plot',
    scopeNoun: 'plot',
    viewportComponent: PlotViewport,
    // Same category three-view's own "Items" tree and graph's "Nested
    // procedures" use (CATEGORY_COMMON_SCOPE) -- a per-scope viewing
    // preference (PlotViewport.vue's wheel-cycle/shift+click selection),
    // not app-level plumbing.
    sidePanelSections: [
        {id: 'plot:helpers', title: 'Plot Helpers', component: PlotHelpersPanel, category: CATEGORY_COMMON_SCOPE},
        // Dev stub for now (DataGroupsPanel.vue's own header comment) --
        // filed under the same category as "Plot Helpers" above, a
        // per-scope viewing/styling preference rather than app-level
        // plumbing.
        {id: 'plot:data-groups', title: 'Data Groups', component: DataGroupsPanel, category: CATEGORY_COMMON_SCOPE}
    ],
    contextual: true,
    contextStoreModules: {
        plotDesk: make_plot_desk_module,
        // Makes this module a real sink *target* (doc/ui-session.rst's
        // "Selection sinks", doc/module-plotter.rst's "Open questions" --
        // this was the one documented gap: the plotter "still declares no
        // receiveSinkMutation"). Same shared factory graph/table already
        // use, kept in its own separate sub-state rather than merged into
        // plotDesk's directly-loaded primitivesByResource -- PlotViewport.vue
        // renders both, but a sink item's forwarded data is never mistaken
        // for a directly-attached resource's own data.
        sinkInbox: make_sink_inbox_module,
        // Generic per-context item-selection/hover state (doc/ui-session
        // .rst's "Selection model") -- same fixed `selection` entry
        // three-view and graph already register under, no plotter-specific
        // state needed: PlotViewport.vue's own MP hit-testing (hitTest.js)
        // just needs somewhere to commit set_hover/clear_hover into.
        selection: make_selection_module
    },
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    // Unlike graph/table's origin-agnostic '*': the plotter only accepts
    // items already typed 'plot' -- whatever produced them (a graph node's
    // subjectData, e.g. na64utils-msadc/viewer/plugin's FSM nodes, or any
    // future origin) tagged the item that way itself, meaning its snapshot
    // is already shaped like this module's own plotData envelope
    // (`{primitives: [...]}`, doc/module-plotter.rst's "Data") --
    // PlotViewport.vue's sinkPrimitives reads it exactly like directly
    // -loaded data, no per-origin conversion. Table's own former "Plot
    // dispatch" projection is intentionally not part of this (doc/module
    // -table.rst) -- postponed, see that doc's "Plot dispatch".
    acceptsPayloadTypes: ['plot'],
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`,
    // Sink *origin* too, now that a primitive can carry its own opaque
    // `subjectData` (e.g. na64umff's per-pulse `peakInfo`/`domain`, or a
    // domain-summed curve's `domain`/`derived` -- doc/module-plotter.rst's
    // "Subject data") -- forwards whichever primitive is selected
    // (PlotViewport.vue's click-to-select, store/selection.js). Mirrors
    // graph/index.js's own resolve_selected_item exactly in spirit, just
    // simpler: a primitive's own `_id` (plotDesk.js/PlotViewport.vue's
    // sinkPrimitives) is already a direct lookup key, no composite-id
    // decoding needed like graph's node/edge duality.
    buildSinkSnapshot(store, contextId) {
        const selectedIds = store.getters[`selection_${contextId}/selectedItemIDs`];
        return [...selectedIds].flatMap(itemId => resolve_selected_primitive(store, contextId, itemId));
    },
    resolveSinkItem(store, contextId, originRef) {
        return resolve_selected_primitive(store, contextId, originRef)[0] ?? null;
    }
});

// Looks at both this context's own directly-loaded desk primitives
// (plotDesk.js) and sink-forwarded ones (store/plotDesk.js's
// resolve_forwarded_primitives, shared with PlotViewport.vue's own
// sinkPrimitives) -- unlike graph's own resolve_selected_item (which only
// ever reads directly-loaded graphBoard data), the primitives that
// actually carry a `subjectData` worth forwarding today are typically
// themselves sink-forwarded ones (e.g. an FSM node's own dashed pulse
// curves, na64umff.py's `_pulse_curves_for_node`) -- a directly-loaded
// plot source's own primitives don't get per-primitive subjectData at all
// yet. `payloadType: 'plotSubject'` is deliberately distinct from this
// module's own `'plot'` (the `{primitives:[...]}` envelope shape
// `acceptsPayloadTypes` above expects) -- a primitive's `subjectData` is a
// different, arbitrary shape (whatever the source attached, e.g.
// na64umff's `{peakInfo, domain}`/`{domain, derived}`), opaque to this
// module either way.
function resolve_selected_primitive(store, contextId, itemId) {
    const own = store.getters[`plotDesk_${contextId}/allPrimitives`] ?? [];
    const item = own.find(p => p._id === itemId)
        ?? resolve_forwarded_primitives(store, contextId).find(p => p._id === itemId);
    if(!item?.subjectData) return [];
    return [{
        itemId,
        srcID: item._facets?.dataSource ?? null,
        originRef: itemId,
        payloadType: 'plotSubject',
        snapshot: item.subjectData
    }];
}
