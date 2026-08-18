// Per-context "desk" state (doc/module-plotter.rst's "Desks" section): one
// item store shared by every data source attached to this plot -- registered
// as this module's own contextStoreModules entry (modules/plotter/index.js),
// the same generic per-context mechanism any contextual viewer module uses
// (doc/ui-session.rst's "Extension points").
//
// A desk does NOT diff/sync items by identity: the plotter has no primitive
// that needs one item replaced without rebuilding the rest (there's no
// per-event-style incremental case here), so a resource's payload is just
// replaced wholesale on every update, keyed by resource name so several
// sources can share one desk without colliding -- the same "keyed by
// contributor, wholesale replace" shape as a sink's landing zone (see
// store/sinkInbox.js), hence sharing keyedCollection.js.
import { make_keyed_collection } from '@/store/keyedCollection';

export function make_plot_desk_module() {
    const keyed = make_keyed_collection({
        stateKey: 'primitivesByResource',
        setMutation: '_set_primitives',
        removeMutation: 'remove_plot_data',
        normalizeValue: primitives => primitives ?? []
    });

    return {
        namespaced: true,

        state: keyed.state,

        getters: {
            ...keyed.getters,
            allPrimitives: state => Object.values(state.primitivesByResource).flat()
        },

        mutations: {
            ...keyed.mutations,
            // Wraps the factory's {key, value} shape under the external
            // mutation name payloadMutation (modules/plotter/index.js)
            // already commits to by string.
            update_plot_data(state, {name, primitives}) {
                keyed.mutations._set_primitives(state, {key: name, value: primitives});
            }
        }
    };
}
