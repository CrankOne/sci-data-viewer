// Registers the 2D plotter as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "plot" data type known to the app -- see main.js.

import { register_module } from '../registry';

import PlotViewport from './PlotViewport.vue';
import { make_plot_desk_module } from './store/plotDesk';
import { make_sink_inbox_module } from '@/store/sinkInbox';

register_module({
    dataType: 'plot',
    label: '2D Plot',
    viewportComponent: PlotViewport,
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
        sinkInbox: make_sink_inbox_module
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
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
});
