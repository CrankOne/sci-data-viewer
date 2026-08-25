// Generic registry of "contexts" -- isolated, per-instance state for a
// viewer-module dataType (a geo3d "scene" is a context of dataType
// "geo3d"; future module types, e.g. an FSM graph or a 2D plot, reuse the
// same mechanism under their own dataType). A context owns its own
// dynamically-registered Vuex module instances (see `contextStoreModules`
// on the module's registration in modules/registry.js) and persists them
// independently.
//
// This module knows nothing about geo3d, view3D, or three.js -- it only
// orchestrates registerModule/unregisterModule against whatever a given
// dataType's viewer module declares. Two exceptions, generic across any
// dataType rather than geo3d-specific: sinkLinks persistence (always
// installed) and `selection`-module persistence (installed when declared,
// see install_selection_persistence below) -- both cross-cutting concerns
// this module owns directly rather than deferring to the per-dataType
// module.
import { get_module } from '@/modules/registry';
import { install_persistence } from '@/store/persistence';

let idCounter = 0;
function generate_context_id() {
    idCounter += 1;
    return `ctx-${Date.now().toString(36)}-${idCounter}`;
}

let linkIdCounter = 0;
function generate_link_id() {
    linkIdCounter += 1;
    return `sink-${Date.now().toString(36)}-${linkIdCounter}`;
}

function mk_default_name(state, dataType) {
    const existing = state.order
        .map(id => state.byId[id])
        .filter(ctx => ctx.dataType === dataType).length;
    return `Scene ${existing + 1}`;
}

// Installs persistence for the facet-preset / selection-set slices of a
// freshly-registered per-context `selection` module instance (doc/ui-
// session.rst's "Selection model", store/selection.js) -- generic across
// any contextual module that registers one, not gated to geo3d/view3D.
// Reuses the generic install_persistence() unchanged -- the only thing
// that varies per context is the storage key and the (fully-qualified,
// namespaced) mutation-type strings passed in, so no changes to
// store/persistence.js itself are needed.
//
// `sessionId` scopes this to one saved session (see
// store/modules/session.js) -- each session's contexts persist their facet
// presets/selection sets independently, even if they happen to share a
// contextId format.
// Installs persistence for one context's sinkLinks (the cross-module
// "selection sink" mechanism -- an origin context's own set of pointers to
// other contexts its selection routes into, see doc/ui-session.rst's
// "Extension points"). Unlike install_selection_persistence above, this
// installs unconditionally for *every* context regardless of dataType --
// sinkLinks is a generic, cross-cutting property of any context, not a
// per-module concern gated to whichever dataType happens to declare a
// `selection`-shaped module.
//
// `contexts` itself is one shared singleton module (not a dynamically
// registered per-context module like selection_<ctx>), so unlike that
// function's serialize(), this one must carry `contextId` in its own
// payload -- the init mutation needs to know *which* context's record to
// update.
//
// `.v2.`: the shape changed from one link per targetDataType
// (`sinkTargets: {[targetDataType]: link}`) to any number of links per
// context (`sinkLinks: {[linkId]: link}`, `link.targetDataType` now a
// field on the link instead of its key) -- true N:N fan-out, see doc/ui-
// session.rst's "Selection sinks". Old `.v1.` data is simply orphaned, not
// migrated: this is prototype-phase persisted state, not worth a migration
// path for.
function install_sink_links_persistence(store, contextId, sessionId) {
    install_persistence(store, {
        storageKey: `viewer.sink-links.v2.${sessionId}.${contextId}`,
        sessionId,
        requiredKey: 'sinkLinks',
        initMutation: 'contexts/initialize_sink_links',
        persistMutations: ['contexts/add_sink_link', 'contexts/remove_sink_link'],
        serialize(rootState) {
            return {contextId, sinkLinks: rootState.contexts.byId[contextId]?.sinkLinks ?? {}};
        }
    });
}

function install_selection_persistence(store, contextId, sessionId) {
    const ns = `selection_${contextId}`;

    install_persistence(store, {
        storageKey: `viewer.facet-presets.v1.${sessionId}.${contextId}`,
        sessionId,
        requiredKey: 'presets',
        initMutation: `${ns}/initialize_facet_presets`,
        persistMutations: [
            `${ns}/initialize_facet_presets`,
            `${ns}/activate_facet_preset`,
            `${ns}/set_active_facet_preset_facets`,
            `${ns}/save_facet_preset`,
            `${ns}/delete_facet_preset`
        ],
        serialize(rootState) {
            const selectionState = rootState[ns];
            return {presets: selectionState.facetPresets, activePresetName: selectionState.activeFacetPresetName};
        }
    });

    install_persistence(store, {
        storageKey: `viewer.selection-sets.v1.${sessionId}.${contextId}`,
        sessionId,
        requiredKey: 'sets',
        initMutation: `${ns}/initialize_selection_sets`,
        persistMutations: [
            `${ns}/initialize_selection_sets`,
            `${ns}/activate_selection_set`,
            `${ns}/save_selection_set`,
            `${ns}/update_active_selection_set`,
            `${ns}/delete_selection_set`
        ],
        serialize(rootState) {
            return {sets: rootState[ns].selectionSets};
        }
    });
}

export default {
    namespaced: true,

    state: () => ({
        byId: {},
        order: []
    }),

    getters: {
        list: state => state.order.map(id => state.byId[id]),
        listForType: state => dataType => state.order
            .map(id => state.byId[id])
            .filter(ctx => ctx.dataType === dataType),
        context: state => id => state.byId[id] ?? null,
        // The cross-module "selection sink" mechanism (doc/ui-session.rst's
        // "Extension points"): a context's own set of *link* records, i.e.
        // "this context's selection routes into that other context, as
        // this payload type, optionally filtered by these facets". True
        // N:N: any number of links may share an origin, a targetDataType,
        // or a targetContextId -- e.g. sending nodes to one plot desk and
        // edges (via a different facetsSelector) to another, both typed
        // 'plot'. Several different origin contexts may also point at the
        // *same* target -- that's how reuse/aggregation happens, with no
        // separate named "sink" entity needed.
        //
        // A link record: `{targetDataType, targetContextId, payloadType,
        // facetsSelector}`. `targetDataType` is now a field on the link
        // (its identity is `linkId`, the key into `sinkLinks`) rather than
        // the link's own key. `payloadType` is mandatory (modules/registry
        // .js's acceptsPayloadTypes -- one specific type, or `'*'` when the
        // target itself accepts anything). `facetsSelector` is optional:
        // `null`, or a plain `{[facetKey]: value}` object every one of
        // whose entries an item's own `_facets` must match (AND) to be
        // forwarded through this link -- see store/sinkDispatch.js's
        // `deliver_to_sink`.
        sinkLinks: state => contextId => state.byId[contextId]?.sinkLinks ?? {},
        // Same data as `sinkLinks` above, as an array carrying its own
        // `linkId` -- what a "list of outgoing links, remove one" UI
        // actually wants (ConnectScopeModal.vue), rather than every caller
        // re-deriving `Object.entries` itself.
        linksFrom: state => contextId => Object.entries(state.byId[contextId]?.sinkLinks ?? {})
            .map(([linkId, link]) => ({linkId, ...link}))
    },

    mutations: {
        add_context(state, {id, name, dataType}) {
            state.byId = {...state.byId, [id]: {id, name, dataType, sinkLinks: {}}};
            state.order = [...state.order, id];
        },

        rename_context(state, {id, name}) {
            const context = state.byId[id];
            if(!context) return;
            const trimmed = name?.trim();
            if(!trimmed) return;
            state.byId = {...state.byId, [id]: {...context, name: trimmed}};
        },

        add_sink_link(state, {contextId, linkId, targetDataType, targetContextId, payloadType, facetsSelector = null}) {
            const context = state.byId[contextId];
            if(!context) return;
            const link = {targetDataType, targetContextId, payloadType, facetsSelector};
            state.byId = {
                ...state.byId,
                [contextId]: {...context, sinkLinks: {...context.sinkLinks, [linkId]: link}}
            };
        },

        remove_sink_link(state, {contextId, linkId}) {
            const context = state.byId[contextId];
            if(!context || !Object.hasOwn(context.sinkLinks, linkId)) return;
            const sinkLinks = {...context.sinkLinks};
            delete sinkLinks[linkId];
            state.byId = {...state.byId, [contextId]: {...context, sinkLinks}};
        },

        // Persistence-restore only -- replaces one context's whole map at once.
        initialize_sink_links(state, {contextId, sinkLinks}) {
            const context = state.byId[contextId];
            if(!context) return;
            state.byId = {...state.byId, [contextId]: {...context, sinkLinks: sinkLinks ?? {}}};
        },

        remove_context(state, id) {
            if(!Object.hasOwn(state.byId, id)) return;
            const byId = {...state.byId};
            delete byId[id];
            state.byId = byId;
            state.order = state.order.filter(existingId => existingId !== id);
        }
    },

    actions: {
        // Creates a new context of `dataType`, registering whatever
        // dynamic Vuex module instances that dataType's viewer module
        // declares (`contextStoreModules`) and seeding them from
        // persistence. Does NOT create a viewport -- a context isn't
        // useful without one, but viewport creation is a separate act
        // (several viewports may attach to one context), left to the
        // caller (see store/modules/widgetInstances.js).
        //
        // `id`, if given, is used as-is instead of generating a random one
        // -- used for the well-known default context (see
        // store/modules/layoutDefaults.js), so its identity -- and
        // therefore its persisted sub-state -- is stable across reloads.
        // Idempotent: a second call with the same `id` is a no-op.
        create_context({state, commit, rootState}, {id, dataType, name} = {}) {
            if(id && state.byId[id]) return id;

            const module = get_module(dataType);
            if(!module?.contextual) {
                throw new Error(`Data type "${dataType}" is not contextual -- it has no per-instance state to isolate`);
            }

            id = id ?? generate_context_id();
            commit('add_context', {id, name: name?.trim() || mk_default_name(state, dataType), dataType});

            for(const [moduleName, makeModule] of Object.entries(module.contextStoreModules ?? {})) {
                this.registerModule([`${moduleName}_${id}`], makeModule(id));
            }
            // `selection` (doc/ui-session.rst's "Selection model") is the
            // one dynamic module with persisted sub-state (facet presets,
            // selection sets) today; transfGroups has none (groups are
            // derived from loaded geometry, not persisted). Gated on the
            // fixed module *name* any contextual module registers under,
            // not on geo3d/view3D specifically -- generic by convention.
            if(module.contextStoreModules?.selection) {
                install_selection_persistence(this, id, rootState.session.activeId);
            }
            // Generic, unlike the selection gate above: every context, of any
            // dataType, can be a sink origin and/or target, so this installs
            // unconditionally.
            install_sink_links_persistence(this, id, rootState.session.activeId);

            return id;
        },

        // The one sanctioned way to create a link (mirrors create_context's
        // own role for contexts): generates its id and returns it, since
        // the caller (ConnectScopeModal.vue) needs it immediately to
        // trigger the first dispatch (store/sinkDispatch.js's
        // send_selection_to_sink now takes a `linkId`, not a
        // `targetDataType` -- see doc/ui-session.rst's "Selection sinks").
        create_sink_link({commit}, {contextId, targetDataType, targetContextId, payloadType, facetsSelector = null}) {
            const linkId = generate_link_id();
            commit('add_sink_link', {contextId, linkId, targetDataType, targetContextId, payloadType, facetsSelector});
            return linkId;
        },

        remove_context({state, commit, dispatch, rootGetters}, {id, reassignSourcesTo} = {}) {
            const context = state.byId[id];
            if(!context) return false;

            const stillMounted = rootGetters['widgetInstances/instancesForContext']?.(id) ?? [];
            if(stillMounted.some(instance => instance.itemType.endsWith(':module'))) {
                throw new Error(`Context "${id}" still has a mounted viewport -- remove or relocate it first`);
            }

            dispatch('connection/reassign_context_sources', {fromContextId: id, toContextId: reassignSourcesTo}, {root: true});

            // `id` may be a sink *target* some other context's sinkLinks
            // points at -- drop those links so they don't dangle (same
            // "clean up a cross-reference at the removal site" shape as
            // reassign_context_sources above, just for the sink mechanism).
            // Several links (not just one, now) may point at the same
            // removed target.
            for(const otherId of state.order) {
                if(otherId === id) continue;
                const other = state.byId[otherId];
                for(const [linkId, link] of Object.entries(other.sinkLinks ?? {})) {
                    if(link.targetContextId === id) {
                        commit('remove_sink_link', {contextId: otherId, linkId});
                    }
                }
            }

            // `id` may be a sink *origin* some other context's landing-zone
            // module is holding routed-in entries for -- let that module
            // (if it opts in via the optional, additive removeIncomingOrigin
            // field) drop them, mirroring how removeMutation lets a module
            // react to a *resource* going away (connection.js).
            for(const otherId of state.order) {
                if(otherId === id) continue;
                const otherModule = get_module(state.byId[otherId].dataType);
                if(!otherModule?.removeIncomingOrigin) continue;
                const mutation = typeof otherModule.removeIncomingOrigin === 'function'
                    ? otherModule.removeIncomingOrigin(otherId)
                    : otherModule.removeIncomingOrigin;
                commit(mutation, id, {root: true});
            }

            const module = get_module(context.dataType);
            for(const moduleName of Object.keys(module?.contextStoreModules ?? {})) {
                this.unregisterModule([`${moduleName}_${id}`]);
            }

            commit('remove_context', id);
            return true;
        }
    }
};
