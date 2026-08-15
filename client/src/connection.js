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

// Appends one path segment (an addressable resource's opaque item id, doc/
// sources.rst) to a base URL. Encodes only the segment itself, never a
// literal "/" the id may (legitimately) contain -- e.g. our own na58geom
// plugin's ids are detectors.dat paths relative to a directory, such as
// "2022/detectors.294553.transv.dat".
function resource_item_url(dataURL, itemId) {
    const base = dataURL.endsWith('/') ? dataURL : `${dataURL}/`;
    const encoded = String(itemId).split('/').map(encodeURIComponent).join('/');
    return new URL(encoded, base);
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
        dataURL: resolve_url_rel_to_endpoint(manifest['data-url'], manifestURL),
        // camelCase alias of the (optional) kebab-case "query-options" --
        // see doc/sources.rst, "Query options". Always an array, even when
        // the source advertises none, so consumers don't need to guard.
        queryOptions: Array.isArray(manifest['query-options']) ? manifest['query-options'] : []
    };
}

// True for a source advertising neither capability (doc/sources.rst) --
// i.e. one whose data-url IS the fetchable payload. An addressable
// source's data-url enumerates items instead, and a sequential source's
// data-url is its principal resource (metadata), not an item -- neither is
// safe to GET-and-render-as-data the way a plain source's is.
export function is_plain_source(manifest) {
    return !manifest.addressable && !manifest.sequential;
}

// Builds the {name: value} map of a resource's query options at their
// advertised defaults (options without a default are left unset -- the
// server decides what omitting them means).
function default_query_values(queryOptions) {
    const values = {};
    for(const opt of queryOptions) {
        if(opt?.schema && Object.prototype.hasOwnProperty.call(opt.schema, 'default')) {
            values[opt.name] = opt.schema.default;
        }
    }
    return values;
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
        },

        set_resource_query_value(state, {name, key, value}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            state.resources = {
                ...state.resources,
                [name]: {...resource, queryValues: {...resource.queryValues, [key]: value}}
            };
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
            Object.values(state.resources).filter(r => r.contextId === contextId),

        // Names of resources currently between "fetched" and "applied to
        // their viewer module" (status 'loading-data') -- i.e. mid
        // load_resource_data/create_resource_session/advance_resource_session.
        // Drives the app-wide LoadingOverlay.vue: shown for exactly this
        // window, covering both the network fetch and whatever synchronous
        // work applying the payload triggers (e.g. GeometryManager rebuilding
        // three.js objects), since the overlay only ever gets hidden again
        // once status leaves 'loading-data'.
        loadingResourceNames: state =>
            Object.values(state.resources).filter(r => r.status === 'loading-data').map(r => r.name)
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
        async add_resource({commit, dispatch}, {
            name, endpoint, load = true, contextId = null, selectedItemId = null, page = 0, signal = undefined
        }) {
            commit('new_resource', {
                name,
                endpoint,
                status: 'loading-manifest',
                manifest: null,
                type: null,
                dataURL: null,
                dataSize: null,
                error: null,
                contextId,
                // current values of the source's advertised query options
                // (doc/sources.rst, "Query options"); populated with
                // defaults once the manifest resolves, see below.
                queryValues: {},
                // For an addressable source (doc/sources.rst): the id of
                // the item currently applied as this resource's data, or
                // null before anything has been picked. Always null for a
                // plain source. Passed in so a restored/persisted resource
                // (see connectionPersistence.js) can carry over which item
                // was loaded.
                selectedItemId,
                // Last page of the item listing the user was browsing (see
                // sourceListItems/addressable.vue) -- a soft UX nicety, not
                // part of the doc/sources.rst enumeration contract itself.
                // Meaningless (left at 0) for a plain/non-enumerable source.
                page,
                // Sequential capability (doc/sources.rst): absolute URL of
                // the active traversal session, or null before one starts
                // (see create_resource_session/sourceListItems/
                // sequential.vue). Sessions are never persisted (in-memory
                // server-side only, see plugins/sequential.py) -- always
                // null on a freshly restored resource.
                sessionURL: null,
                // Opaque, display-only (doc/sources.rst forbids assigning
                // meaning to it).
                sessionId: null,
                sessionFinished: false,
                // Local "how many advances have I seen" UI counter -- NOT
                // a server-side sequence number or item identifier.
                sessionStep: 0,
                // Last-applied `current` payload, kept so
                // reassign_resource_context can re-deliver it to a new
                // context without creating a new (non-replayable) session.
                sessionLastData: null
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
                        error: null,
                        // Defaults for any newly-advertised option; a value
                        // the user already set (e.g. surviving a "reload
                        // manifest") is kept as-is.
                        queryValues: {...default_query_values(manifest.queryOptions), ...resource.queryValues}
                    }
                });
                if(load) {
                    // An addressable source's data-url now enumerates items
                    // rather than being a fetchable payload itself (doc/
                    // sources.rst) -- only fetch it as such when there's a
                    // previously-selected item to restore (see
                    // connectionPersistence.js); otherwise leave the
                    // resource "ready" for the user to pick one via its
                    // widget (sourceListItems/addressable.vue).
                    if(manifest.addressable) {
                        if(resource.selectedItemId) {
                            await dispatch('load_resource_data', {name, itemId: resource.selectedItemId});
                        }
                    } else if(is_plain_source(manifest)) {
                        await dispatch('load_resource_data', {name});
                    }
                    // else: sequential-only manifest -- GET data-url is its
                    // principal resource (metadata), not an item, so there
                    // is nothing to auto-fetch. Left "ready" for the user to
                    // start a session (sourceListItems/sequential.vue).
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
            if(resource) {
                // Best-effort, fire-and-forget release of an active
                // sequential session (doc/sources.rst) -- not awaited, so a
                // slow/dead server doesn't hold up resource removal.
                if(resource.sessionURL) {
                    fetch(resource.sessionURL, {method: 'DELETE'}).catch(() => {});
                }
                clean_up_resource_data(commit, resource);
            }
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

            if(wasLoaded && resource.sessionURL) {
                // A sequential session (doc/sources.rst) is resource-scoped
                // and forward-only/non-replayable -- moving contexts must
                // not start a new session or re-fetch (GET data-url isn't
                // an item for a sequential source). Re-deliver the last
                // item that was applied instead.
                if(resource.sessionLastData !== null && resource.sessionLastData !== undefined) {
                    await dispatch('apply_resource_data', {
                        resource: state.resources[name], data: resource.sessionLastData
                    });
                }
            } else if(wasLoaded) {
                // Re-apply whichever item was loaded (if any -- addressable
                // sources only) under the new context; a plain source has
                // no selectedItemId and just re-fetches its one payload.
                await dispatch('load_resource_data', {
                    name, ...(resource.selectedItemId ? {itemId: resource.selectedItemId} : {})
                });
            }
        },

        // Records a new value for one of the resource's advertised query
        // options (see SourceListItem/sourceListItems/static.vue) and, if
        // the resource has already been loaded at least once, re-fetches
        // its data (the same item, for an addressable source) so the
        // change takes effect immediately.
        async set_resource_query_value({state, commit, dispatch}, {name, key, value}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            commit('set_resource_query_value', {name, key, value});
            if(resource.status === 'loaded' || resource.status === 'error') {
                await dispatch('load_resource_data', {
                    name, ...(resource.selectedItemId ? {itemId: resource.selectedItemId} : {})
                });
            }
        },

        // Records which page of the item listing the user was last browsing
        // (see sourceListItems/addressable.vue) -- purely a "soft" UX
        // nicety (persisted the same way as everything else here, see
        // connectionPersistence.js, so a reload resumes on the same page)
        // rather than a doc/sources.rst concept, so it never triggers a
        // re-fetch of the loaded item itself.
        set_resource_page({state, commit}, {name, page}) {
            if(!state.resources[name]) return;
            commit('update_resource', {name, changes: {page}});
        },

        // Lists one page of an addressable+enumerable resource's available
        // items (doc/sources.rst, "Enumeration"/"Pagination") -- e.g. for
        // sourceListItems/addressable.vue's picker. Purely a read; does not
        // touch the store, since the listing is cheap to re-fetch and page-
        // scoped rather than resource-scoped state.
        async list_resource_items({state}, {name, page = 0, pageSize = undefined, signal = undefined}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            const url = new URL(resource.dataURL);
            url.searchParams.set('page', String(page));
            if(pageSize !== undefined) url.searchParams.set('page-size', String(pageSize));
            return fetch_json(url.href, {signal});
        },

        // Fetch the payload for an already registered resource: its one
        // (plain-source) payload, or -- when `itemId' is given -- one item
        // of an addressable source, at GET {data-url}/{itemId} (doc/
        // sources.rst, "Addressable capability").
        async load_resource_data({state, commit, dispatch}, {name, itemId = undefined, query = undefined, signal = undefined}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            if(!resource.manifest) {
                throw new Error(`Manifest for resource ${name} has not been loaded`);
            }
            console.debug(resource);  // XXX
            const url = itemId !== undefined
                ? resource_item_url(resource.dataURL, itemId)
                : new URL(resource.dataURL);
            // Explicit `query' overrides the resource's stored option
            // values (see set_resource_query_value below) key-by-key,
            // rather than replacing them outright.
            const effectiveQuery = {...resource.queryValues, ...(query ?? {})};
            for(const [key, value] of Object.entries(effectiveQuery)) {
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

            commit('update_resource', {name, changes: {status: 'loading-data', error: null}});

            try {
                const data = await fetch_json(url.href, {signal});
                await dispatch('apply_resource_data', {resource, data});
                commit('update_resource', {
                    name,
                    changes: {
                        status: 'loaded',
                        dataSize: JSON.stringify(data).length,
                        error: null,
                        ...(itemId !== undefined ? {selectedItemId: itemId} : {})
                    }
                });
                return data;
            } catch(error) {
                commit('update_resource', {name, changes: {status: 'error', error: String(error)}});
                console.error(`Failed to load data for resource "${name}" from ${url}:`, error);
                throw error;
            }
        },

        // Sequential capability (doc/sources.rst): creates a fresh
        // traversal session and applies its initial item, if any. Mirrors
        // load_resource_data's role for an addressable source, except
        // there's no itemId -- the server decides the starting position.
        async create_resource_session({state, commit, dispatch}, {name}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            // 'loading-data' drives the app-wide LoadingOverlay (see the
            // loadingResourceNames getter) -- set before the fetch, so the
            // overlay is already painted by the time apply_resource_data's
            // synchronous work (e.g. GeometryManager rebuilding three.js
            // objects) runs.
            commit('update_resource', {name, changes: {status: 'loading-data', error: null}});
            try {
                const url = new URL('sessions', resource.dataURL.endsWith('/') ? resource.dataURL : `${resource.dataURL}/`);
                const response = await fetch(url.href, {method: 'POST', headers: {Accept: 'application/json'}});
                if(response.status !== 201) {
                    throw new Error(`POST ${url} failed with HTTP ${response.status}`);
                }
                const location = response.headers.get('Location');
                if(!location) {
                    throw new Error(`Session creation response from ${url} carried no Location header`);
                }
                const sessionURL = new URL(location, resource.dataURL).href;
                const body = await response.json();
                commit('update_resource', {
                    name,
                    changes: {
                        sessionURL,
                        sessionId: location.split('/').filter(Boolean).pop(),
                        sessionFinished: Boolean(body.finished),
                        sessionStep: 0,
                        sessionLastData: body.current ?? null
                    }
                });
                if(body.current !== null && body.current !== undefined) {
                    await dispatch('apply_resource_data', {resource: state.resources[name], data: body.current});
                    commit('update_resource', {
                        name,
                        changes: {status: 'loaded', dataSize: JSON.stringify(body.current).length, error: null}
                    });
                } else {
                    commit('update_resource', {name, changes: {status: 'ready', error: null}});
                }
            } catch(error) {
                commit('update_resource', {name, changes: {status: 'error', error: String(error)}});
                throw error;
            }
        },

        // Advances an active session by exactly one item (doc/sources.rst)
        // and applies the result the same way create_resource_session does.
        async advance_resource_session({state, commit, dispatch}, {name}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            if(!resource.sessionURL) {
                throw new Error(`Resource "${name}" has no active session`);
            }
            // See create_resource_session's identical note on ordering this
            // before the fetch, for LoadingOverlay's benefit.
            commit('update_resource', {name, changes: {status: 'loading-data', error: null}});
            try {
                const response = await fetch(resource.sessionURL, {method: 'POST', headers: {Accept: 'application/json'}});
                if(!response.ok) {
                    throw new Error(`POST ${resource.sessionURL} failed with HTTP ${response.status}`);
                }
                const body = await response.json();
                commit('update_resource', {
                    name,
                    changes: {
                        sessionFinished: Boolean(body.finished),
                        sessionStep: (resource.sessionStep ?? 0) + 1,
                        sessionLastData: body.current ?? null
                    }
                });
                if(body.current !== null && body.current !== undefined) {
                    await dispatch('apply_resource_data', {resource: state.resources[name], data: body.current});
                    commit('update_resource', {
                        name,
                        changes: {status: 'loaded', dataSize: JSON.stringify(body.current).length, error: null}
                    });
                } else {
                    commit('update_resource', {name, changes: {status: 'ready', error: null}});
                }
            } catch(error) {
                commit('update_resource', {name, changes: {status: 'error', error: String(error)}});
                throw error;
            }
        },

        // Releases an active session (doc/sources.rst). Leaves whatever was
        // last rendered on screen -- releasing ends the traversal, it
        // doesn't clear the scene (mirrors an addressable resource keeping
        // its last-picked item after unrelated actions).
        async release_resource_session({state, commit}, {name}) {
            const resource = state.resources[name];
            if(!resource?.sessionURL) return;
            try {
                await fetch(resource.sessionURL, {method: 'DELETE'});
            } catch(error) {
                console.warn(`Failed to release session for resource "${name}":`, error);
            }
            commit('update_resource', {
                name,
                changes: {sessionURL: null, sessionId: null, sessionFinished: false, sessionStep: 0}
            });
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
