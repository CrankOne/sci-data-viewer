// Breaks any cycle in the auto-dispatch graph -- a context's own sink links,
// resent on every selection change (store/sinkAutoDispatch.js), and a
// transform's own feed/outputLinks loop (store/transformDispatch.js) -- by
// refusing to re-enter an origin still on the current synchronous call
// stack. Nothing in SinkWiringPanel.vue's is_valid_connection stops a
// transform's own output from being wired back into one of its own feeding
// contexts (or a longer cycle through several hops); without this, that
// wiring sends store.commit's own synchronous subscriber mechanism into
// unbounded recursion, one call-stack level deeper on every hop. Depending
// on how much work each hop does, that either overflows the JS call stack
// outright (self-recovering, if noisy) or, if slow enough per hop, runs long
// enough for the browser's own "unresponsive script" watchdog to kill the
// tab first -- which does NOT unwind back through any try/catch, leaving
// whatever was mid-flight (e.g. connection.js's own status:'loading-data',
// driving LoadingOverlay.vue) stuck forever, unrecoverable short of a
// reload. Cutting the cycle off after one extra hop, well before either of
// those, is the only way to actually prevent that rather than clean up
// after it.
//
// Keyed on a plain string id (a context or transform id, prefixed by the
// caller so the two id spaces can't collide) rather than object identity --
// every id here is already a plain string throughout the store.
const inFlight = new Set();

export function enter_dispatch(id) {
    if(inFlight.has(id)) {
        console.warn(
            `Auto-dispatch cycle detected at "${id}" -- its own output loops back ` +
            'into itself, directly or through other links/transforms. Skipped this ' +
            'hop to avoid an infinite cascade; check the wiring diagram for a cycle through it.'
        );
        return false;
    }
    inFlight.add(id);
    return true;
}

export function exit_dispatch(id) {
    inFlight.delete(id);
}
