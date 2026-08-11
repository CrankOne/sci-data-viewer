// Registry of widget instances placed in the panel layout -- the join
// between "a layout leaf" (see store/modules/layout.js, which stays 100%
// about arrangement and knows nothing about scenes) and "a context" (see
// store/modules/contexts.js).
//
// `itemType` is a panelItems.js-style id: viewport-kind (e.g.
// 'geo3d:module') or subpanel-kind (e.g. 'geo3d:items-tree'). `contextId`
// is set for instances of a contextual module type, `null` otherwise.
// Several viewport instances may share one contextId (independent cameras,
// shared geometry/selection); a viewport's contextId is fixed at creation,
// while a subpanel's may be reassigned later via `set_instance_context`.

let idCounter = 0;
export function generate_instance_id() {
    idCounter += 1;
    return `wi-${Date.now().toString(36)}-${idCounter}`;
}

export default {
    namespaced: true,

    state: () => ({
        byId: {}
    }),

    getters: {
        instance: state => id => state.byId[id] ?? null,
        instancesForContext: state => contextId =>
            Object.values(state.byId).filter(instance => instance.contextId === contextId)
    },

    mutations: {
        add_instance(state, {instanceId, itemType, contextId = null}) {
            state.byId = {...state.byId, [instanceId]: {instanceId, itemType, contextId}};
        },

        remove_instance(state, instanceId) {
            const byId = {...state.byId};
            delete byId[instanceId];
            state.byId = byId;
        },

        set_instance_context(state, {instanceId, contextId}) {
            const instance = state.byId[instanceId];
            if(!instance) return;
            state.byId = {...state.byId, [instanceId]: {...instance, contextId}};
        }
    },

    actions: {
        // `instanceId`, if given, is used as-is (see store/modules/layoutDefaults.js,
        // which needs stable, well-known ids for the default instances).
        // Idempotent: a second call with the same `instanceId` is a no-op.
        create_instance({state, commit}, {instanceId, itemType, contextId = null} = {}) {
            if(instanceId && state.byId[instanceId]) return instanceId;
            instanceId = instanceId ?? generate_instance_id();
            commit('add_instance', {instanceId, itemType, contextId});
            return instanceId;
        }
    }
};
