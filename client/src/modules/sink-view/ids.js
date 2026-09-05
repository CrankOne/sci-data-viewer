// Composite selection id for one landed sink item, unique across this
// context's whole sinkInbox (which may hold several origins at once, each
// forwarding its own originRef-keyed items -- store/sinkInbox.js's
// incomingByOrigin) -- mirrors modules/graph/ids.js's own node/edge
// composite-id role, just without a "kind" to disambiguate. `originRef`
// alone is only unique *within* one origin's own forwarded batch.
const SEP = '::';

export function make_selection_id(originContextId, originRef) {
    return `${originContextId}${SEP}${originRef}`;
}

// originContextId is always one of our own generated ids (ctx-.../
// transform-...), never containing SEP -- splitting on the *first*
// occurrence is what keeps this correct even if originRef itself happens
// to contain the separator.
export function destruct_selection_id(compositeId) {
    const at = compositeId.indexOf(SEP);
    return {originContextId: compositeId.slice(0, at), originRef: compositeId.slice(at + SEP.length)};
}
