// Registers the 2D plotter as a client-side viewer module (see
// ../registry.js). Importing this file for its side effect is enough to
// make the "plot" data type known to the app -- see main.js.

import { register_module } from '../registry';

import PlotViewport from './PlotViewport.vue';
import { make_plot_desk_module } from './store/plotDesk';

register_module({
    dataType: 'plot',
    label: '2D Plot',
    viewportComponent: PlotViewport,
    contextual: true,
    contextStoreModules: {
        plotDesk: make_plot_desk_module
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
    }
});
