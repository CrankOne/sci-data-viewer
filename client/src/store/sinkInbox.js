import { make_keyed_collection } from '@/store/keyedCollection';

// Per-context landing zone for items routed in from other contexts'
// selections (the cross-module "selection sink" mechanism, doc/ui-session
// .rst's "Extension points") -- deliberately separate from any directly
// -loaded item state a module may have of its own, never merged into it.
// One instance per context (see store/modules/contexts.js). Shared by any
// module wanting to be a sink *target* -- modules/sink-view/'s dev stub
// (proving the mechanism end to end) and modules/table/'s real "Selection
// view" use case (doc/module-table.rst) both register this same factory
// under their own `receiveSinkMutation`.
export function make_sink_inbox_module() {
    const keyed = make_keyed_collection({
        stateKey: 'incomingByOrigin',
        setMutation: '_set_incoming',
        removeMutation: 'clear_incoming_origin'
        // normalizeValue left default -- value is already {type, items, receivedAt}
    });

    return {
        namespaced: true,

        state: keyed.state,

        getters: {
            ...keyed.getters,
            incomingList: state => Object.entries(state.incomingByOrigin)
                .map(([originContextId, entry]) => ({originContextId, ...entry}))
        },

        mutations: {
            ...keyed.mutations,
            // Wraps the factory's {key, value} shape under the external
            // mutation name each consumer's own `receiveSinkMutation`
            // (modules/registry.js) already commits to by string.
            receive_sink_items(state, {originContextId, type, items}) {
                keyed.mutations._set_incoming(state, {
                    key: originContextId,
                    value: {type, items, receivedAt: Date.now()}
                });
            }
        }
    };
}
