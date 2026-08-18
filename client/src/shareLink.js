// A deliberately narrow sibling to sessionExport.js: shares a *snapshot* of
// which items are loaded (and selected) on one or two addressable/
// enumerable data sources -- never layout, camera, session identity, or any
// other session-scoped state. Unlike a session export, this is never meant
// to reflect the app's live state in the address bar: a link is generated
// on demand ("Copy permalink", see AppControls.vue), and once opened, its
// query param is stripped immediately (see apply_share_from_route) so the
// URL never lingers as something that looks live but isn't.
//
// Sources are matched across browsers/deployments by `endpoint` (the only
// thing that identifies a source independent of whatever local name either
// side gave it) -- never by resource name, session id, or context id, none
// of which have any meaning outside the browser that generated them. A
// source with no match in the opening browser's active session, or one
// that exists but isn't connected to a scene, is silently skipped: the
// opening user's own environment decides what's available, this never
// tries to create sources or scenes to make one fit.
//
// Only geo3d's own selection state (store/selection.js's generic
// `selection_${id}` context module -- doc/ui-session.rst's "Selection
// model") is understood here -- there's only one contextual module type
// today. A second one would need this generalized (e.g. via a per-module
// "share" hook next to payloadMutation/payload in modules/registry.js)
// rather than the hardcoded `selection_${id}` namespace below.
import { full_geo_id, destruct_geo_id } from './modules/three-view/utils';

const FORMAT = 'viewer-share';
const VERSION = 1;
const QUERY_KEY = 'share';

//                          * * *   * * *   * * *
// gzip + base64url, via the browser's native (Baseline, no dependency)
// Compression Streams API -- kept out of the address bar's length only
// as a courtesy; even uncompressed, the payloads this handles (a couple of
// sources, a handful of selected items) would comfortably fit any browser's
// URL length limit.

async function gzip_to_base64url(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for(const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function gunzip_from_base64url(encoded) {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

//                          * * *   * * *   * * *

// True for a resource this mechanism can say anything about at all: an
// addressable+enumerable source (doc/sources.rst) with an item loaded and a
// scene to select things in. Sequential and plain sources are out of scope
// entirely (see this file's header comment).
function is_shareable_resource(resource) {
    return !!resource.manifest?.addressable
        && !!resource.manifest?.collection?.enumerable
        && !!resource.selectedItemId
        && !!resource.contextId;
}

export function has_shareable_content(store) {
    return Object.values(store.state.connection.resources).some(is_shareable_resource);
}

// Builds the plain-object payload (pre-compression) for every currently
// shareable resource: which item it has loaded, its query-option values,
// and whatever of the current selection in its scene belongs to *that*
// resource specifically (a scene may hold items from several sources, and
// a selected id's own "@srcID" suffix -- see modules/three-view/utils.js --
// is how ownership is determined; ids are re-qualified to the *local*
// resource name again on the other side, once it's known).
export function build_share_payload(store) {
    const sources = Object.values(store.state.connection.resources)
        .filter(is_shareable_resource)
        .map(resource => {
            const selectionState = store.state[`selection_${resource.contextId}`];

            const geoItemIDs = [];
            const markers = {};
            if(selectionState) {
                for(const id of selectionState.selectedItemIDs) {
                    const [srcID, geoID] = destruct_geo_id(id);
                    if(srcID === resource.name) geoItemIDs.push(geoID);
                }
                for(const [id, indices] of selectionState.selectedSubItems) {
                    const [srcID, geoID] = destruct_geo_id(id);
                    if(srcID === resource.name && indices.size) markers[geoID] = [...indices].sort((a, b) => a - b);
                }
            }

            return {
                endpoint: resource.endpoint,
                itemId: resource.selectedItemId,
                queryValues: resource.queryValues ?? {},
                geoItemIDs: geoItemIDs.sort(),
                markers
            };
        });

    return {format: FORMAT, version: VERSION, sources, resolvers: []};
}

// Builds a full, absolute permalink URL encoding the current shareable
// state, for the "Copy permalink" action (AppControls.vue) to put on the
// clipboard. Reuses the app's one existing route, only adding a query
// param to it -- see apply_share_from_route for the other end.
export async function build_permalink(store, router) {
    const encoded = await gzip_to_base64url(JSON.stringify(build_share_payload(store)));
    const resolved = router.resolve({path: router.currentRoute.value.path, query: {[QUERY_KEY]: encoded}});
    const url = new URL(location.href);
    url.hash = resolved.fullPath;
    return url.href;
}

// Applies one source entry against whichever of the opening user's own
// resources matches its endpoint -- see this file's header comment for the
// matching/skip rules. Independent of every other entry, so callers may run
// these concurrently.
async function apply_share_source_entry(store, entry) {
    const resource = Object.values(store.state.connection.resources)
        .find(candidate => candidate.endpoint === entry.endpoint && candidate.contextId);
    if(!resource) return; // no connected local match -- silently skipped, by design

    for(const [key, value] of Object.entries(entry.queryValues ?? {})) {
        store.commit('connection/set_resource_query_value', {name: resource.name, key, value});
    }

    try {
        await store.dispatch('connection/load_resource_data', {name: resource.name, itemId: entry.itemId});
    } catch(error) {
        console.error(`Shared link: could not load item for "${resource.name}":`, error);
        return;
    }

    const ns = `selection_${resource.contextId}`;
    if(entry.geoItemIDs?.length) {
        store.commit(`${ns}/select_items`, entry.geoItemIDs.map(geoID => full_geo_id(resource.name, geoID)));
    }
    for(const [geoID, indices] of Object.entries(entry.markers ?? {})) {
        if(indices?.length) {
            store.commit(`${ns}/select_sub_items`, {itemID: full_geo_id(resource.name, geoID), indices});
        }
    }
}

// Reads a `share` query param off the current route (if any), applies it
// against the now-active session's resources, and -- regardless of whether
// anything actually matched -- strips it from the address bar immediately.
// The link is a one-shot action, not a live reflection of app state (see
// this file's header comment): leaving it in place would silently re-apply
// on every future reload of that exact URL, long after it's stopped being
// relevant.
//
// Must run after whichever session ends up active has finished hydrating
// its own resources (see sessionActivation.js's activate_session, the only
// caller) -- matching happens against that session's resources, not a
// blank slate.
export async function apply_share_from_route(store, router) {
    const {[QUERY_KEY]: encoded, ...rest} = router.currentRoute.value.query;
    if(!encoded) return;

    await router.replace({query: rest});

    let payload;
    try {
        payload = JSON.parse(await gunzip_from_base64url(encoded));
    } catch(error) {
        console.error('Shared link could not be read:', error);
        return;
    }
    if(payload?.format !== FORMAT || payload.version !== VERSION || !Array.isArray(payload.sources)) {
        console.error('Shared link is not a recognized format');
        return;
    }

    await Promise.all(payload.sources.map(entry => apply_share_source_entry(store, entry)));
}
