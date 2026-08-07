//                          * * *   * * *   * * *

// Ongoing manifest fetch request.
// Populated once new data source gets added, when the manifest fetching is
// active.
// name -> {controller, generation}
const gManifestRequests = new Map();

//                          * * *   * * *   * * *

// Handlers for various resource types. By receiving a payload of a certain
// type should commit appropriate changes in a global state.
const RESOURCE_TYPE_HANDLERS = Object.freeze({
    geo3d: {
        mutation: 'view3D/update_geo_data',
        payload(resource, data) {
            return {name: resource.name, geoData: data};
        }
    }

    // Future examples:
    //
    // timeseries: {
    //     mutation: 'plots/update_time_series',
    //     payload(resource, data) {
    //         return {name: resource.name, data};
    //     }
    // }
});

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
    actions: {
        // Add and inspect a resource.
        // `load' controls whether its payload is fetched immediately
        async add_resource({commit, dispatch}, {name, endpoint, load = true, signal = undefined}) {
            commit('new_resource', {
                name,
                endpoint,
                status: 'loading-manifest',
                manifest: null,
                type: null,
                dataURL: null,
                dataSize: null,
                error: null
            });

            return dispatch('fetch_resource_manifest', {name, load});
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

        remove_resource({commit}, name) {
            gManifestRequests.get(name)?.controller.abort();
            gManifestRequests.delete(name);
            commit('remove_resource', name);
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

        // fwd a resource payload to its type-specific consumer.
        apply_resource_data({commit}, {resource, data}) {
            const handler = RESOURCE_TYPE_HANDLERS[resource.type];
            if(!handler) {
                throw new Error(`Unsupported resource type ${JSON.stringify(resource.type)}`);
            }
            commit(handler.mutation, handler.payload(resource, data), {root: true});
        }
    }
};

export {stateModule};
