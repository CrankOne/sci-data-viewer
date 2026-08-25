//                          * * *   * * *   * * *

import { get_module } from './modules/registry';

// Ongoing manifest fetch request.
// Populated once new data source gets added, when the manifest fetching is
// active.
// name -> {controller, generation}
const gManifestRequests = new Map();

// Fails fast, before a fetch is even attempted, when a resource's type
// needs a context (doc/data-model.rst's "data source" entity always
// declares exactly one contextual-or-not `type`) but none is assigned yet
// -- used by every data-fetching action below (load_resource_data/
// create_resource_cursor/advance_resource_cursor). Used to be checked only
// once the fetch had already completed (the old apply_resource_data), which
// wasted a round-trip on a request doomed to fail; checking up front is
// strictly better and costs nothing extra to call three times.
function require_resource_module(resource) {
    const module = get_module(resource.type);
    if(!module) {
        throw new Error(`No viewer module registered for resource type ${JSON.stringify(resource.type)}`);
    }
    if(module.contextual && !resource.contextId) {
        throw new Error(`Resource "${resource.name}" has type "${resource.type}", which requires a context, but none is assigned`);
    }
    return module;
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
        // load_resource_data/create_resource_cursor/advance_resource_cursor.
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
        // resource with no contextId fails fast (require_resource_module,
        // above) the moment a data fetch is attempted, not silently.
        async add_resource({commit, dispatch}, {
            name, endpoint, load = true, contextId = null, selectedItemId = null, page = 0,
            facetsSelector = null, signal = undefined
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
                // Optional `{facetKey: value}` filter (doc/data-model.rst's
                // "One input concept per scope, not two") narrowing this
                // resource's membership rule the same way a sink link's own
                // facetsSelector already narrows *its* membership -- applied
                // by each contextual module's own live getter against every
                // item's `_facets` (store/facets.js's matches_facets_selector,
                // after with_data_source_facet has run). `null` -- the
                // default -- means every item qualifies, unconditionally,
                // same as before this existed.
                facetsSelector,
                // Last-fetched raw payload (doc/data-model.rst's
                // "Resolution is always live, never copied"): the one
                // owned copy of this resource's data -- every contextual
                // module's own per-context getters read this live instead
                // of keeping a pushed copy of their own (e.g. modules/
                // three-view/store/view3D.js's `geoData` getter). Also
                // doubles as a sequential resource's last-applied cursor
                // `current` item, so reassign_resource_context has nothing
                // to re-deliver -- there's simply nothing to invalidate
                // when contextId changes underneath a live getter.
                data: null,
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
                // the active traversal cursor, or null before one starts
                // (see create_resource_cursor/sourceListItems/
                // sequential.vue). Cursors are never persisted (in-memory
                // server-side only, see plugins/sequential.py) -- always
                // null on a freshly restored resource.
                cursorURL: null,
                // Opaque, display-only (doc/sources.rst forbids assigning
                // meaning to it).
                cursorId: null,
                cursorFinished: false,
                // Local "how many advances have I seen" UI counter -- NOT
                // a server-side sequence number or item identifier.
                cursorStep: 0
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
                    // start a cursor (sourceListItems/sequential.vue).
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
                // sequential cursor (doc/sources.rst) -- not awaited, so a
                // slow/dead server doesn't hold up resource removal.
                if(resource.cursorURL) {
                    fetch(resource.cursorURL, {method: 'DELETE'}).catch(() => {});
                }
            }
            gManifestRequests.get(name)?.controller.abort();
            gManifestRequests.delete(name);
            commit('remove_resource', name);
        },

        // Reassigns a resource to a different context (see
        // SourceListItem.vue's scene-reassignment control) -- a plain field
        // flip, nothing more: no module owns a copy of this resource's data
        // any more (doc/data-model.rst's "Resolution is always live, never
        // copied"), so every contextual module's own getters simply start
        // filtering this resource under its new contextId on their very
        // next read, with no re-fetch, no cleanup, and (for a sequential
        // resource) no special-cased cursor-data re-delivery needed either
        // -- `resource.data` already holds whatever was last applied,
        // cursor or not, and reassignment never touches it. A no-op if
        // already on that context.
        reassign_resource_context({state, commit}, {name, contextId}) {
            const resource = state.resources[name];
            if(!resource) throw new Error(`Unknown resource ${name}`);
            if(resource.contextId === contextId) return;
            commit('update_resource', {name, changes: {contextId}});
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

        // Fetches one page of row-window data (doc/sources.rst's "Row-window
        // pagination") from a table-like resource's own data-representation
        // endpoint -- GET {data-url} for a plain source, or GET
        // {data-url}/{itemId} for one addressable item, mirroring
        // load_resource_data's own dual-mode URL construction. Distinct from
        // list_resource_items above, whose "page"/"page-size" enumerate
        // which *items* an addressable source has -- this paginates *within*
        // one already-identified dataset's own rows instead. Purely a read;
        // does not touch the store, for the same reason list_resource_items
        // doesn't (page-scoped, cheap to re-fetch, not resource-scoped state
        // worth persisting here) -- doc/module-table.rst's TableController
        // owns the accumulated row cache on the caller's side.
        async fetch_row_window({state}, {
            name, page = 0, pageSize = undefined, itemId = undefined,
            sortColumn = undefined, sortDirection = undefined, signal = undefined
        }) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            const url = itemId !== undefined
                ? resource_item_url(resource.dataURL, itemId)
                : new URL(resource.dataURL);
            url.searchParams.set('page', String(page));
            if(pageSize !== undefined) url.searchParams.set('page-size', String(pageSize));
            // `sort-column`/`sort-direction`: a convention local to this
            // random-access adapter and its demo backend (doc/module-table
            // .rst's "Sorting"), not part of doc/sources.rst's own
            // row-window pagination spec.
            if(sortColumn !== undefined) url.searchParams.set('sort-column', sortColumn);
            if(sortDirection !== undefined) url.searchParams.set('sort-direction', sortDirection);
            return fetch_json(url.href, {signal});
        },

        // Fetch the payload for an already registered resource: its one
        // (plain-source) payload, or -- when `itemId' is given -- one item
        // of an addressable source, at GET {data-url}/{itemId} (doc/
        // sources.rst, "Addressable capability").
        async load_resource_data({state, commit}, {name, itemId = undefined, query = undefined, signal = undefined}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            if(!resource.manifest) {
                throw new Error(`Manifest for resource ${name} has not been loaded`);
            }
            require_resource_module(resource);
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
                commit('update_resource', {
                    name,
                    changes: {
                        status: 'loaded',
                        data,
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
        // traversal cursor and applies its initial item, if any. Mirrors
        // load_resource_data's role for an addressable source, except
        // there's no itemId -- the server decides the starting position.
        async create_resource_cursor({state, commit}, {name}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            require_resource_module(resource);
            // 'loading-data' drives the app-wide LoadingOverlay (see the
            // loadingResourceNames getter) -- set before the fetch, so the
            // overlay is already painted by the time this commit's
            // synchronous downstream work (e.g. GeometryManager rebuilding
            // three.js objects, driven by a module's own live getter) runs.
            commit('update_resource', {name, changes: {status: 'loading-data', error: null}});
            try {
                const url = new URL('cursors', resource.dataURL.endsWith('/') ? resource.dataURL : `${resource.dataURL}/`);
                const response = await fetch(url.href, {method: 'POST', headers: {Accept: 'application/json'}});
                if(response.status !== 201) {
                    throw new Error(`POST ${url} failed with HTTP ${response.status}`);
                }
                const location = response.headers.get('Location');
                if(!location) {
                    throw new Error(`Cursor creation response from ${url} carried no Location header`);
                }
                const cursorURL = new URL(location, resource.dataURL).href;
                const body = await response.json();
                commit('update_resource', {
                    name,
                    changes: {
                        cursorURL,
                        cursorId: location.split('/').filter(Boolean).pop(),
                        cursorFinished: Boolean(body.finished),
                        cursorStep: 0,
                        data: body.current ?? null
                    }
                });
                if(body.current !== null && body.current !== undefined) {
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

        // Advances an active cursor by exactly one item (doc/sources.rst)
        // and applies the result the same way create_resource_cursor does.
        async advance_resource_cursor({state, commit}, {name}) {
            const resource = state.resources[name];
            if(!resource) {
                throw new Error(`Unknown resource ${name}`);
            }
            if(!resource.cursorURL) {
                throw new Error(`Resource "${name}" has no active cursor`);
            }
            require_resource_module(resource);
            // See create_resource_cursor's identical note on ordering this
            // before the fetch, for LoadingOverlay's benefit.
            commit('update_resource', {name, changes: {status: 'loading-data', error: null}});
            try {
                const response = await fetch(resource.cursorURL, {method: 'POST', headers: {Accept: 'application/json'}});
                if(!response.ok) {
                    throw new Error(`POST ${resource.cursorURL} failed with HTTP ${response.status}`);
                }
                const body = await response.json();
                commit('update_resource', {
                    name,
                    changes: {
                        cursorFinished: Boolean(body.finished),
                        cursorStep: (resource.cursorStep ?? 0) + 1,
                        data: body.current ?? null
                    }
                });
                if(body.current !== null && body.current !== undefined) {
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

        // Releases an active cursor (doc/sources.rst). Leaves whatever was
        // last rendered on screen -- releasing ends the traversal, it
        // doesn't clear the scene (mirrors an addressable resource keeping
        // its last-picked item after unrelated actions).
        async release_resource_cursor({state, commit}, {name}) {
            const resource = state.resources[name];
            if(!resource?.cursorURL) return;
            try {
                await fetch(resource.cursorURL, {method: 'DELETE'});
            } catch(error) {
                console.warn(`Failed to release cursor for resource "${name}":`, error);
            }
            commit('update_resource', {
                name,
                changes: {cursorURL: null, cursorId: null, cursorFinished: false, cursorStep: 0}
            });
        },

        // Moves every resource currently targeting `fromContextId` to
        // `toContextId` -- used when a context is removed (see
        // store/modules/contexts.js) so its sources aren't silently
        // orphaned. Already just a plain field flip, same as
        // reassign_resource_context above -- no module owns a copy to clean
        // up or re-fetch.
        reassign_context_sources({state, commit}, {fromContextId, toContextId}) {
            for(const resource of Object.values(state.resources)) {
                if(resource.contextId !== fromContextId) continue;
                commit('update_resource', {name: resource.name, changes: {contextId: toContextId ?? null}});
            }
        }
    }
};

export {stateModule};
