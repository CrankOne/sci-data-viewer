import { make_keyed_collection } from '@/store/keyedCollection';

// Per-context landing zone for items routed in from other contexts'
// selections (the cross-module "selection sink" mechanism, doc/ui-session
// .rst's "Extension points") -- deliberately separate from any directly
// -loaded item state (this stub module has none of its own), never merged
// into it. One instance per context (see store/modules/contexts.js).
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
            // mutation name receiveSinkMutation (modules/sink-view/index.js)
            // already commits to by string.
            receive_sink_items(state, {originContextId, type, items}) {
                keyed.mutations._set_incoming(state, {
                    key: originContextId,
                    value: {type, items, receivedAt: Date.now()}
                });
            }
        }
    };
}
