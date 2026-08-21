// The one sanctioned path for routing something out of an origin context
// into whatever context its sinkTargets[targetDataType] *link* points at
// (doc/ui-session.rst's "Extension points", the cross-module "selection
// sink" mechanism) -- mirrors sceneCreation.js's role as the single
// sanctioned path for creating a scene.
//
// Update-by-snapshot, but no longer purely one-shot: calling
// send_selection_to_sink still snapshots/builds+sends the payload once,
// but store/sinkAutoDispatch.js now calls it again automatically every
// time the origin's selection changes for as long as the link exists --
// "less tedious updates" without turning a sink into a live pointer (the
// dispatched payload is still a snapshot, just resent on your behalf). A
// link's own `payloadType`/`facetsSelector` (store/modules/contexts.js)
// narrow what actually gets through on every such resend.
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
// built: resolve the origin's sinkTargets link, confirm the target module
// still actually accepts that link's payloadType (a link persists across
// reloads -- modules/registry.js's declarations could in principle have
// changed since), narrow `items` down to the link's payloadType +
// facetsSelector, and commit.
export function deliver_to_sink(store, {originContextId, targetDataType, items}) {
    const origin = store.getters['contexts/context'](originContextId);
    const link = origin?.sinkTargets?.[targetDataType];
    if(!link) {
        throw new Error(`No sink target of type "${targetDataType}" set for context "${originContextId}"`);
    }

    const targetModule = get_module(targetDataType);
    if(!targetModule?.receiveSinkMutation || !payload_type_accepted(targetDataType, link.payloadType)) {
        throw new Error(`Data type "${targetDataType}" cannot receive "${link.payloadType}" sink items`);
    }

    const filtered = items.filter(item =>
        (link.payloadType === '*' || item.payloadType === link.payloadType)
        && matches_facets_selector(item.snapshot?._facets, link.facetsSelector)
    );

    const mutation = typeof targetModule.receiveSinkMutation === 'function'
        ? targetModule.receiveSinkMutation(link.targetContextId)
        : targetModule.receiveSinkMutation;

    store.commit(mutation, {originContextId, payloadType: link.payloadType, items: filtered}, {root: true});
}

// Generic selection-based dispatch: looks up the origin *context*'s own
// dataType, then that module's `buildSinkSnapshot` (modules/registry.js)
// to get its current selection as sink items -- no per-dataType branching
// here, unlike the geo3d-only/graph-only functions this replaced. A module
// that never declares `buildSinkSnapshot` (e.g. table, whose "Plot
// dispatch" isn't selection-based at all -- see send_table_projection_to_sink
// below) simply isn't usable as a *selection* sink origin; nothing calls
// this for it.
export function send_selection_to_sink(store, {originContextId, targetDataType}) {
    const origin = store.getters['contexts/context'](originContextId);
    const originModule = get_module(origin?.dataType);
    if(!originModule?.buildSinkSnapshot) {
        throw new Error(`Data type "${origin?.dataType}" has no selection to send to a sink`);
    }
    const items = originModule.buildSinkSnapshot(store, originContextId);
    deliver_to_sink(store, {originContextId, targetDataType, items});
}

// doc/module-table.rst's "Plot dispatch": a *different* thing from
// "Selection sinks" above despite sharing delivery -- this carries a
// column projection (x/y values across the currently loaded rows), not
// "the current selection", so it has no `buildSinkSnapshot` counterpart
// and isn't auto-resent by store/sinkAutoDispatch.js (that only reacts to
// selection changes). `items` is built by the caller
// (modules/table/TableViewport.vue), tagged with its own `payloadType`
// (`'table-projection'`) the same as any other item -- what counts as a
// projection, and what type it is, is entirely this module's own concern.
export function send_table_projection_to_sink(store, {originContextId, targetDataType, items}) {
    deliver_to_sink(store, {originContextId, targetDataType, items});
}
