// Resolves the *references* landed in a sink inbox (store/sinkInbox.js)
// into their current live data -- read fresh from each reference's origin
// context every time this is called, never cached. store/sinkDispatch.js's
// deliver_to_sink stores identity only (itemId/srcID/payloadType/
// originRef), not a data copy, so "what does this look like right now" is
// always answered here.
//
// An origin that's been removed (`contexts/context` returns null) or whose
// module no longer resolves this particular reference (`resolveSinkItem`
// returns null/undefined -- e.g. the item itself was deleted) simply
// contributes nothing. This is the entire mechanism behind doc/ui-session
// .rst's "a sink item must not display anything once its origin context is
// removed" -- there is no separate cleanup step to get right for
// correctness (contexts.js's removeIncomingOrigin still prunes the stale
// reference list itself on removal, but only for tidiness -- resolution
// already fails safe without it).
import { get_module } from '@/modules/registry';

export function resolve_incoming_sink_items(store, incomingList) {
    return incomingList.flatMap(({originContextId, items}) => {
        const origin = store.getters['contexts/context'](originContextId);
        const originModule = origin && get_module(origin.dataType);
        if(!originModule?.resolveSinkItem) return [];

        return items.flatMap(ref => {
            const resolved = originModule.resolveSinkItem(store, originContextId, ref.originRef);
            return resolved ? [{originContextId, ...resolved}] : [];
        });
    });
}
