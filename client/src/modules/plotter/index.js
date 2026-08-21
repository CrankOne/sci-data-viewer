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
    // connection.js's generic hook into module internals (doc/ui-session.rst's
    // "Extension points"): a function of the resource's contextId, since
    // plotDesk is registered per-context rather than under one fixed
    // namespace.
    payloadMutation: contextId => `plotDesk_${contextId}/update_plot_data`,
    payload(resource, data) {
        // `data` is the raw fetched body -- doc/module-plotter.rst's
        // "plotData" envelope. `subjectData` has no consumer yet (its shape
        // is still an open question in that doc), so only primitives are
        // forwarded.
        return {name: resource.name, primitives: data?.plotData?.primitives ?? []};
    },
    removeMutation: contextId => `plotDesk_${contextId}/remove_plot_data`,
    removePayload(resource) {
        return resource.name;
    },
    receiveSinkMutation: contextId => `sinkInbox_${contextId}/receive_sink_items`,
    // Unlike graph/table's origin-agnostic '*': the plotter only knows how
    // to turn a *specific* set of payload shapes into primitives
    // (PlotViewport.vue's sinkPrimitives) -- a graph node/edge that happens
    // to carry `subjectData.plot.primitives` (e.g. na64utils-msadc/viewer/
    // plugin's FSM nodes), or a table column projection
    // (`{xColumn, yColumn, data}`, doc/module-table.rst's "Plot dispatch").
    // Anything else received is simply not renderable and is dropped by
    // sinkPrimitives, not by this list -- the list only gates which *links*
    // ConnectScopeModal.vue offers creating in the first place.
    acceptsPayloadTypes: ['graph-node', 'graph-edge', 'table-projection'],
    removeIncomingOrigin: contextId => `sinkInbox_${contextId}/clear_incoming_origin`
});
