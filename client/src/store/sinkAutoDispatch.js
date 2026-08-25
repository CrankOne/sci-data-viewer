// "Less tedious updates" for the cross-module "selection sink" mechanism
// (doc/ui-session.rst's "Extension points"): once a link exists (store/
// modules/contexts.js's sinkLinks), its origin's selection changing
// re-sends the (still-filtered-by-payloadType/facetsSelector) reference set
// automatically, for *every* link that origin has -- no more manually
// re-clicking "Send selection to sink" after every click in the origin.
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
        if(!namespace?.startsWith(SELECTION_NS_PREFIX) || !SELECTION_CHANGING_MUTATIONS.has(mutationName))
            return;

        const originContextId = namespace.slice(SELECTION_NS_PREFIX.length);
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
    });
}
