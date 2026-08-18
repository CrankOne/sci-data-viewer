// Generic "keyed collection" fragment: a dict keyed by contributor
// (resource name, origin context id, ...), replaced wholesale per key on
// update, deleted per key on removal. Two shapes share this exactly:
// the plotter's own primitivesByResource (modules/plotter/store/plotDesk.js)
// and a sink's incoming-selection landing zone (modules/sink-view/store/
// sinkInbox.js) -- pulled out once rather than hand-rolled twice.
//
// Returns a *module fragment* -- {state, mutations, getters} meant to be
// spread into a real `make_X_module()`'s returned options object, not a
// standalone Vuex module (no `namespaced` of its own). `setMutation`/
// `removeMutation` are caller-supplied names rather than fixed strings, so
// a consumer can keep committing to whatever external mutation name its own
// payloadMutation/removeMutation/receiveSinkMutation hook already reads by
// string (see plotDesk.js and sinkInbox.js for how each wraps these under
// their real external name).
export function make_keyed_collection({stateKey, setMutation, removeMutation, normalizeValue = value => value}) {
    return {
        state: () => ({[stateKey]: {}}),

        mutations: {
            [setMutation](state, {key, value}) {
                state[stateKey] = {...state[stateKey], [key]: normalizeValue(value)};
            },

            [removeMutation](state, key) {
                if(!Object.hasOwn(state[stateKey], key))
                    return;
                const next = {...state[stateKey]};
                delete next[key];
                state[stateKey] = next;
            }
        },

        getters: {
            [`${stateKey}Entries`]: state => Object.entries(state[stateKey])
        }
    };
}
