//                          * * *   * * *   * * *

import { get_module } from './modules/registry';

// Ongoing manifest fetch request.
// Populated once new data source gets added, when the manifest fetching is
// active.
// name -> {controller, generation}
const gManifestRequests = new Map();

// Drops a loaded resource's data from its (current) context's module, via
// the owning viewer module's removeMutation/removePayload (mirrors
// payloadMutation/payload) -- a no-op for a resource that was never loaded,
// isn't contextual, or whose module declares no removeMutation.
function clean_up_resource_data(commit, resource) {
    if(resource.status !== 'loaded' || !resource.type || !resource.contextId) return;
    const module = get_module(resource.type);
    if(!module?.removeMutation) return;
    const mutation = typeof module.removeMutation === 'function'
        ? module.removeMutation(resource.contextId)
        : module.removeMutation;
    const payload = module.removePayload ? module.removePayload(resource) : resource.name;
    commit(mutation, payload, {root: true});
}

//                          * * *   * * *   * * *

// Relative data URLs are resolved against the manifest endpoint,
// rather than against the current SPA URL.
function resolve_url_rel_to_endpoint(url, baseURL) {
    console.debug(url, baseURL);  // XXX
    return new URL(url, baseURL).href;
}

// Async JSON data fetch (local utility)
async function fetch_json(url, {signal} = {}) {
    const response = await fetch(url, {
        headers: {Accept: 'application/json'},
        signal
    });
    if(!response.ok) {
        throw new Error(`GET ${url} failed with HTTP ${response.status}`);
    }
    return response.json();
}

// validates manifest and resolves data URL wrt endpoint
function normalize_manifest(manifest, manifestURL) {
    if(typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        throw new TypeError(`Resource manifest from ${manifestURL} is not an object`);
    }
    if(typeof manifest['data-url'] !== 'string' || manifest['data-url'].length === 0) {
        throw new TypeError(`Resource manifest from ${manifestURL} has no valid "data-url"`);
    }
    if(typeof manifest.type !== 'string' || manifest.type.length === 0) {
        throw new TypeError(`Resource manifest from ${manifestURL} has no valid "type"`);
    }
    if(typeof manifest.sequential !== 'boolean' || typeof manifest.addressable !== 'boolean') {
        throw new TypeError(
            `Resource manifest from ${manifestURL} must explicitly advertise `
            + `"sequential" and "addressable" capabilities (booleans)`
        );
    }
    return {
        ...manifest,
        dataURL: resolve_url_rel_to_endpoint(manifest['data-url'], manifestURL)
    };
}

//                          * * *   * * *   * * *

const stateModule = {
    namespaced: true,
    state: () => ({
        resources: {}
    }),
    mutations: {
        new_resource(state, resource) {
            state.resources = {...state.resources, [resource.name]: resource};
            console.debug(`new resource "${resource.name}" -> "${resource.dataURL}" added`);
        },
        update_resource(state, {name, changes}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            state.resources = {
                ...state.resources,
                [name]: {...resource, ...changes}
            };
            console.debug(`resource "${name}" updated`);
        },

        remove_resource(state, name) {
            const resources = {...state.resources};
            delete resources[name];
            state.resources = resources;
            console.debug(`resource "${name}" removed`);
        }
    },
    getters: {
        // The data type of whichever loaded resource is currently driving
        // the viewport (see modules/registry.js). v1 keeps a single active
        // type at a time -- the first resource that has resolved a type.
        activeType: state => Object.values(state.resources).find(r => r.type)?.type ?? null,

        // Every resource currently assigned to a given context -- used to
        // warn before removing a context's last viewport (see Panel.vue).
        resourcesForContext: state => contextId =>
            Object.values(state.resources).filter(r => r.contextId === contextId)
    },
    actions: {
        // Add and inspect a resource. `load' controls whether its payload is
        // fetched immediately -- pass `load: false' to resolve just the
        // (cheap) manifest first and inspect its `type' before committing to
        // a context and the (potentially large) data fetch; see
        // assign_resource_context below and SourcesList.vue's add-source
        // flow. `contextId' defaults to unassigned; a contextual-type
        // resource with no contextId fails at apply_resource_data() below,
        // not silently.
        async add_resource({commit, dispatch}, {name, endpoint, load = true, contextId = null, signal = undefined}) {
            commit('new_resource', {
                name,
                endpoint,
                status: 'loading-manifest',
                manifest: null,
                type: null,
                dataURL: null,
                dataSize: null,
                error: null,
                contextId
            });

            return dispatch('fetch_resource_manifest', {name, load});
        },

        // Sets (or reassigns) which context a resource's data lands in --
        // called once the caller has resolved which scene to use, before
        // load_resource_data.
        assign_resource_context({commit}, {name, contextId}) {
            commit('update_resource', {name, changes: {contextId}});
        },

        async fetch_resource_manifest({state, commit, dispatch}, {name, load = true}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            // Abort an older request for the same resource.
            gManifestRequests.get(name)?.controller.abort();
            const controller = new AbortController();
            // A monotonically increasing generation prevents an obsolete request
            // from updating the store after a retry.
            const generation = (gManifestRequests.get(name)?.generation ?? 0) + 1;
            gManifestRequests.set(name, {controller, generation});
            commit('update_resource', {
                name,
                changes: {status: 'loading-manifest', manifest: null, error: null}
            });
            try {
                const rawManifest = await fetch_json(resource.endpoint, {signal: controller.signal});
                const activeRequest = gManifestRequests.get(name);
                if(activeRequest?.generation !== generation) {
                    return null;
                }
                const manifest = normalize_manifest(rawManifest, resource.endpoint);
                commit('update_resource', {
                    name,
                    changes: {
                        status: 'ready',
                        manifest,
                        type: manifest.type,
                        dataURL: manifest.dataURL,
                        error: null
                    }
                });
                if(load) {
                    await dispatch('load_resource_data', {name});
                }
                return manifest;
            } catch(error) {
                const activeRequest = gManifestRequests.get(name);
                if(activeRequest?.generation !== generation) {
                    return null;
                }
                if(error.name === 'AbortError') {
                    commit('update_resource', {name, changes: {status: 'cancelled', error: null}});
                    return null;
                }
                commit('update_resource', {name, changes: {status: 'error', error: error.message}});
                throw error;
            } finally {
                const activeRequest = gManifestRequests.get(name);
                if(activeRequest?.generation === generation) {
                    gManifestRequests.delete(name);
                }
            }
        },

        cancel_resource_manifest_fetch({state}, name) {
            if(!state.resources[name]) return;
            gManifestRequests.get(name)?.controller.abort();
        },

        retry_resource_manifest({dispatch}, {name, load = true}) {
            return dispatch('fetch_resource_manifest', {name, load});
        },

        remove_resource({state, commit}, name) {
            const resource = state.resources[name];
            if(resource) clean_up_resource_data(commit, resource);
            gManifestRequests.get(name)?.controller.abort();
            gManifestRequests.delete(name);
            commit('remove_resource', name);
        },

        // Reassigns an already-added, already-loaded resource to a
        // different context: drops its data from the old context and
        // re-fetches/re-applies it under the new one (see
        // SourceListItem.vue's scene-reassignment control). A no-op if the
        // resource isn't loaded yet or is already on that context.
        async reassign_resource_context({state, commit, dispatch}, {name, contextId}) {
            const resource = state.resources[name];
            if(!resource) throw new Error(`Unknown resource ${name}`);
            if(resource.contextId === contextId) return;

            const wasLoaded = resource.status === 'loaded';
            if(wasLoaded) clean_up_resource_data(commit, resource);

            commit('update_resource', {name, changes: {contextId}});

            if(wasLoaded) await dispatch('load_resource_data', {name});
        },

        // Fetch the payload for an already registered resource.
        async load_resource_data({state, commit, dispatch}, {name, query = undefined, signal = undefined}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            if(!resource.manifest) {
                throw new Error(`Manifest for resource ${name} has not been loaded`);
            }
            console.debug(resource);  // XXX
            const url = new URL(resource.dataURL);
            if(query) {
                for(const [key, value] of Object.entries(query)) {
                    if(value === undefined || value === null) {
                        continue;
                    }
                    if(Array.isArray(value)) {
                        for(const item of value) {
                            url.searchParams.append(key, String(item));
                        }
                    } else {
                        url.searchParams.set(key, String(value));
                    }
                }
            }

            commit('update_resource', {name, changes: {status: 'loading-data', error: null}});

            try {
                const data = await fetch_json(url.href, {signal});
                await dispatch('apply_resource_data', {resource, data});
                commit('update_resource', {
                    name,
                    changes: {status: 'loaded', dataSize: JSON.stringify(data).length, error: null}
                });
                return data;
            } catch(error) {
                commit('update_resource', {name, changes: {status: 'error', error: String(error)}});
                console.error(`Failed to load data for resource "${name}" from ${url}:`, error);
                throw error;
            }
        },

        // fwd a resource payload to its type-specific viewer module.
        apply_resource_data({commit}, {resource, data}) {
            const module = get_module(resource.type);
            if(!module) {
                throw new Error(`No viewer module registered for resource type ${JSON.stringify(resource.type)}`);
            }
            if(module.contextual && !resource.contextId) {
                throw new Error(`Resource "${resource.name}" has type "${resource.type}", which requires a context, but none is assigned`);
            }
            const mutation = typeof module.payloadMutation === 'function'
                ? module.payloadMutation(resource.contextId)
                : module.payloadMutation;
            commit(mutation, module.payload(resource, data), {root: true});
        },

        // Moves every resource currently targeting `fromContextId` to
        // `toContextId` -- used when a context is removed (see
        // store/modules/contexts.js) so its sources aren't silently
        // orphaned.
        reassign_context_sources({state, commit}, {fromContextId, toContextId}) {
            for(const resource of Object.values(state.resources)) {
                if(resource.contextId !== fromContextId) continue;
                commit('update_resource', {name: resource.name, changes: {contextId: toContextId ?? null}});
            }
        }
    }
};

export {stateModule};
