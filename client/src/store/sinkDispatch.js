// The one sanctioned path for routing something out of an origin context
// into whatever context one of its sinkLinks *link* points at (doc/ui-
// session.rst's "Extension points", the cross-module "selection sink"
// mechanism) -- mirrors sceneCreation.js's role as the single sanctioned
// path for creating a scene. A link is identified by `linkId`, not
// `targetDataType` -- any number of links may share a targetDataType (true
// N:N fan-out, contexts.js's own header comment on `sinkLinks`).
//
// Deciding *what currently qualifies* is still triggered on demand --
// calling send_selection_to_sink builds+delivers once, and store/
// sinkAutoDispatch.js calls it again automatically every time the origin's
// selection changes for as long as the link exists. What actually gets
// persisted at the target, though, is identity only -- see deliver_to_sink
// below -- never a data copy: store/sinkResolve.js resolves each landed
// reference's current value fresh, on demand, whenever a consumer needs it.
import { get_module, payload_type_accepted } from '@/modules/registry';

// AND-matches `facetsSelector` (a plain `{[facetKey]: value}` object, or
// null/undefined for "no filter") against one item's own `_facets`. Every
// entry in the selector must be present and equal on the item -- an item
// with no `_facets` at all (or missing the given key) fails any non-empty
// selector, never matches by omission.
function matches_facets_selector(facets, selector) {
    if(!selector) return true;
    if(!facets) return false;
    return Object.entries(selector).every(([key, value]) => facets[key] === value);
}

// The part every dispatch flavor shares, regardless of how `items` was
// built: resolve the named link (by id, not targetDataType -- several
// links may share one), confirm the target module still actually accepts
// that link's payloadType (a link persists across reloads -- modules/
// registry.js's declarations could in principle have changed since),
// narrow `items` down to the link's payloadType + facetsSelector, and
// commit -- identity only, never `item.snapshot` itself (store/
// sinkResolve.js re-derives current data from `originRef` whenever a
// consumer actually needs it; see modules/registry.js's `resolveSinkItem`).
// Filtering still needs the *current* snapshot's `_facets`, which `items`
// still carries at this point -- only what gets persisted afterward is
// stripped down.
export function deliver_to_sink(store, {originContextId, linkId, items}) {
    const origin = store.getters['contexts/context'](originContextId);
    const link = origin?.sinkLinks?.[linkId];
    if(!link) {
        throw new Error(`No sink link "${linkId}" set for context "${originContextId}"`);
    }

    const targetModule = get_module(link.targetDataType);
    if(!targetModule?.receiveSinkMutation || !payload_type_accepted(link.targetDataType, link.payloadType)) {
        throw new Error(`Data type "${link.targetDataType}" cannot receive "${link.payloadType}" sink items`);
    }

    const filtered = items.filter(item =>
        (link.payloadType === '*' || item.payloadType === link.payloadType)
        && matches_facets_selector(item.snapshot?._facets, link.facetsSelector)
    );

    const mutation = typeof targetModule.receiveSinkMutation === 'function'
        ? targetModule.receiveSinkMutation(link.targetContextId)
        : targetModule.receiveSinkMutation;

    const refs = filtered.map(({itemId, srcID, payloadType, originRef}) => ({itemId, srcID, payloadType, originRef}));
    store.commit(mutation, {originContextId, payloadType: link.payloadType, items: refs}, {root: true});
}

// Generic selection-based dispatch: looks up the origin *context*'s own
// dataType, then that module's `buildSinkSnapshot` (modules/registry.js)
// to get its current selection as sink items -- no per-dataType branching
// here, unlike the geo3d-only/graph-only functions this replaced. A module
// that never declares `buildSinkSnapshot` (e.g. table, which has no
// selection-based sink dispatch at all) simply isn't usable as a
// *selection* sink origin; nothing calls this for it.
export function send_selection_to_sink(store, {originContextId, linkId}) {
    const origin = store.getters['contexts/context'](originContextId);
    const originModule = get_module(origin?.dataType);
    if(!originModule?.buildSinkSnapshot) {
        throw new Error(`Data type "${origin?.dataType}" has no selection to send to a sink`);
    }
    const items = originModule.buildSinkSnapshot(store, originContextId);
    deliver_to_sink(store, {originContextId, linkId, items});
}
