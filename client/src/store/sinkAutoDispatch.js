// "Less tedious updates" for the cross-module "selection sink" mechanism
// (doc/ui-session.rst's "Extension points"): once a link exists (store/
// modules/contexts.js's sinkLinks), its origin's selection changing
// re-sends the (still-filtered-by-payloadType/facetsSelector) reference set
// automatically, for *every* link that origin has -- no manual re-send
// needed after every click in the origin.
// This governs *which* items currently qualify for each link, re-evaluated
// on every selection change; it has nothing to do with the *data* those
// references resolve to, which is never cached here or at the target
// (store/sinkResolve.js reads it fresh on demand) -- the only thing this
// adds is *when* send_selection_to_sink's identity-set gets recomputed,
// never how the underlying data is read.
//
// Installed once, globally, independent of any one session (main.js,
// right after the store is created) -- unlike store/persistence.js's
// installers, this isn't persisted state, just a standing store.subscribe.
import { get_module } from '@/modules/registry';
import { send_selection_to_sink } from '@/store/sinkDispatch';

const SELECTION_NS_PREFIX = 'selection_';
const SINK_INBOX_NS_PREFIX = 'sinkInbox_';

// The store/selection.js mutations that actually change *which* items are
// selected -- deliberately excludes hover (set_hover/clear_hover), sub-item
// selection, visibility, and facet-preset/selection-set bookkeeping
// mutations that don't themselves change selectedItemIDs: those are either
// not what a sink snapshot is built from (buildSinkSnapshot implementations
// all read selectedItemIDs) or, for apply_selection_set, already covered by
// its own entry below.
const SELECTION_CHANGING_MUTATIONS = new Set([
    'select_items', 'unselect_items', 'clear_selection', 'apply_selection_set'
]);

export function install_sink_auto_dispatch(store) {
    store.subscribe(mutation => {
        const [namespace, mutationName] = mutation.type.split('/');

        if(namespace?.startsWith(SELECTION_NS_PREFIX) && SELECTION_CHANGING_MUTATIONS.has(mutationName)) {
            dispatch_from_selection_change(store, namespace.slice(SELECTION_NS_PREFIX.length));
        } else if(namespace?.startsWith(SINK_INBOX_NS_PREFIX) && mutationName === 'receive_sink_items') {
            prune_selection_after_inbox_update(store, namespace.slice(SINK_INBOX_NS_PREFIX.length));
        }
    });
}

function dispatch_from_selection_change(store, originContextId) {
    const origin = store.getters['contexts/context'](originContextId);
    const originModule = get_module(origin?.dataType);
    // A context whose module never declares buildSinkSnapshot isn't a
    // selection-based sink origin at all (e.g. table's own "Plot
    // dispatch" isn't selection-based) -- nothing to resend, and no
    // link could have been created pointing away from it in the first
    // place (ConnectScopeModal.vue only offers that for such modules).
    if(!originModule?.buildSinkSnapshot) return;

    const links = store.getters['contexts/linksFrom'](originContextId);
    for(const {linkId, targetDataType} of links) {
        try {
            send_selection_to_sink(store, {originContextId, linkId});
        } catch(error) {
            // A stale link (its target module's registry declaration
            // changed since the link was created/persisted) shouldn't
            // break every other active link or spam an uncaught error
            // on every single click -- surfaced once per attempt, not
            // thrown.
            console.warn(`Auto sink dispatch "${originContextId}" -> "${targetDataType}" (${linkId}) failed:`, error);
        }
    }
}

// The other half of "less tedious updates", closing the gap the dispatch
// side above can't: a context's own *selection* is an opaque id set (store/
// selection.js) with no relationship to whatever data currently exists --
// nothing prunes a selected id whose underlying item has since disappeared
// out from under it. That's invisible for a directly-loaded resource (its
// own module re-renders selected-but-gone ids as simply absent), but it
// silently breaks the chain for a context that both *receives* sink items
// and *forwards its own selection* onward to a further link (e.g. a graph
// node selection routed into a plot, one of whose curves is then itself
// selected and routed on to a JSON viewer): switching the graph's selection
// replaces the plot's incoming primitives, but the plot's *own*
// selectedItemIDs -- still holding the old curve's id -- is untouched, so
// nothing re-fires dispatch_from_selection_change above, and the viewer
// keeps showing the stale curve's already-resolved data forever (until the
// user happens to reselect the original graph item, regenerating the same
// id and making it look "remembered").
//
// Fired whenever a context's sinkInbox lands new content (the one point
// where "my input just changed under me" is generically observable,
// regardless of which module or dataType): re-run that context's own
// buildSinkSnapshot -- which already resolves a selected id to nothing once
// its underlying item is gone (modules/registry.js's own resolveSinkItem
// contract) -- and unselect_items whatever no longer round-trips. Reuses
// `originRef` (not `itemId`) as the comparison key: registry.js's own
// buildSinkSnapshot contract states `originRef` is "whatever internal key
// resolveSinkItem needs to find this same item again", which for both
// modules/graph/index.js and modules/plotter/index.js today is exactly the
// same string selectedItemIDs itself stores -- `itemId` is a separate,
// cross-module-presentable identity that need not match.
// `unselect_items` is itself in SELECTION_CHANGING_MUTATIONS above, so this
// re-triggers dispatch_from_selection_change for *this* context's own
// outgoing links automatically -- de-propagation cascades through as many
// further hops as the chain has, not just this one.
//
// Known imprecision, accepted rather than solved: buildSinkSnapshot omits
// an item both when it's genuinely gone *and* when it exists but simply
// carries no forwardable payload (graph's own aspect check, plotter's own
// `subjectData` check) -- there's no separate "does this id still exist at
// all" hook in the registry contract today, only "is it currently worth
// forwarding". A selected item that never had forwardable data to begin
// with would get pruned here on any unrelated inbox churn in the same
// context, which is over-eager for a hypothetical future selection use
// that isn't sink-forwarding. Left as-is because every selection use today
// is either this forwarding path (which this fixes) or plain visual
// highlighting (unaffected either way -- that already reads live desk/board
// content directly, not this Set, so a stale id there was already inert).
function prune_selection_after_inbox_update(store, contextId) {
    const module = get_module(store.getters['contexts/context'](contextId)?.dataType);
    if(!module?.buildSinkSnapshot) return;

    const selectionNS = `selection_${contextId}`;
    const selectedIds = store.getters[`${selectionNS}/selectedItemIDs`];
    if(!selectedIds?.size) return;

    const stillValid = new Set(module.buildSinkSnapshot(store, contextId).map(item => item.originRef));
    const stale = [...selectedIds].filter(id => !stillValid.has(id));
    if(stale.length) store.commit(`${selectionNS}/unselect_items`, stale);
}
