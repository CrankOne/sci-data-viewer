// Bundles a saved session's complete localStorage footprint into one
// portable JSON object (see store/persistence.js's key manifest for how its
// keys are discovered), and the reverse: registers an imported bundle as a
// brand-new session with fresh ids throughout, so it can never collide with
// or overwrite anything already in this browser.
//
// What's NOT portable: a data source's `endpoint` (see connection.js) is an
// absolute URL to wherever that source's server actually lives. An
// imported session simply won't be able to load a source whose server
// isn't reachable from the importing client -- same as sharing any dead
// link, and left as-is rather than treated as an error; a source the
// importing client can't reach is no worse off than one it never had.
// Nothing else about a session ties it to this machine.
import { list_session_keys, register_session_key, write_stored } from './store/persistence';

const FORMAT = 'viewer-session';
const VERSION = 1;

function generate_id(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Recursively replaces any string -- object key or value -- found in `idMap`
// with its mapped replacement. Used to rewrite every session/context/
// widget-instance id an imported bundle contains, wherever it appears
// (see import_session's doc comment for why panel/split ids are excluded
// from `idMap` and therefore left untouched).
function deep_remap(value, idMap) {
    if(typeof value === 'string') return idMap.get(value) ?? value;
    if(Array.isArray(value)) return value.map(v => deep_remap(v, idMap));
    if(value && typeof value === 'object') {
        const out = {};
        for(const [k, v] of Object.entries(value)) {
            out[idMap.get(k) ?? k] = deep_remap(v, idMap);
        }
        return out;
    }
    return value;
}

// A storage key's dot-separated segments include the session id (and, for
// per-context keys, the context id) verbatim -- e.g.
// "viewer.facet-presets.v1.sess-abc.ctx-def". Remap those segments the same
// way as everything else.
function remap_storage_key(key, idMap) {
    return key.split('.').map(seg => idMap.get(seg) ?? seg).join('.');
}

// Builds the exportable bundle for `sessionId`: every key its manifest
// lists, read straight from localStorage, plus enough metadata (format/
// version/name) to make the file self-describing.
export function export_session(store, sessionId) {
    const entry = store.state.session.directory.byId[sessionId];
    if(!entry) throw new Error(`Unknown session "${sessionId}"`);

    const keys = list_session_keys(sessionId);
    const entries = {};
    for(const key of keys) {
        const raw = localStorage.getItem(key);
        if(raw == null) continue;
        try {
            entries[key] = JSON.parse(raw);
        } catch(error) {
            console.warn(`Skipping unreadable session entry "${key}" from export:`, error);
        }
    }

    return {
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        sessionId,
        name: entry.name,
        entries
    };
}

// Registers `bundle` (as produced by export_session, quite possibly from a
// different browser or deployment entirely) as a brand-new session. Every
// id the bundle contains -- its own session id, and every context/widget-
// instance id referenced inside its layout entry -- is remapped to a fresh
// one first, so importing the same file twice (or into a browser that
// happens to already have a same-named session) just yields two
// independent sessions rather than a collision.
//
// Panel/split ids inside the layout tree are deliberately left as-is:
// they're purely internal to that one tree, never referenced by any other
// entry or by any storage key name, so remapping them has no correctness
// benefit.
//
// Returns the new session's id, ready to hand to activate_session()
// (sessionActivation.js) the same as any other session id.
export function import_session(store, bundle) {
    if(bundle?.format !== FORMAT) {
        throw new Error('Not a recognized session export file');
    }
    if(bundle.version !== VERSION) {
        throw new Error(`Unsupported session export version: ${bundle.version}`);
    }
    if(!bundle.sessionId || typeof bundle.entries !== 'object' || !bundle.entries) {
        throw new Error('Session export file is malformed');
    }

    const idMap = new Map();
    idMap.set(bundle.sessionId, generate_id('sess'));

    const layoutData = bundle.entries[`viewer.layout.v1.${bundle.sessionId}`];
    for(const contextId of Object.keys(layoutData?.contexts?.byId ?? {})) {
        idMap.set(contextId, generate_id('ctx'));
    }
    for(const instanceId of Object.keys(layoutData?.instances ?? {})) {
        idMap.set(instanceId, generate_id('wi'));
    }

    const newSessionId = idMap.get(bundle.sessionId);
    for(const [key, value] of Object.entries(bundle.entries)) {
        const newKey = remap_storage_key(key, idMap);
        write_stored(newKey, deep_remap(value, idMap));
        register_session_key(newSessionId, newKey);
    }

    store.dispatch('session/import_session_entry', {
        id: newSessionId,
        name: bundle.name ? `${bundle.name} (imported)` : undefined
    });

    return newSessionId;
}
