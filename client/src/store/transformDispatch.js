// Runs every transform fed by `originContextId` or `resourceName` (store/
// modules/transforms.js's two feed kinds) against that origin's current
// content: a console preview always (so the user can see what a transform
// produces without needing a wired target -- handy while iterating on its
// source in components/modals/TransformEditorModal.vue), plus real
// delivery to whichever contexts the transform's own `outputLinks` name --
// via store/sinkDispatch.js's send_selection_to_sink, completely unchanged:
// store/originResolve.js's resolve_origin already lets that function treat
// a transform id exactly like a context id.
//
// Three callers: store/sinkAutoDispatch.js, for both a selection-changing
// mutation in a feeding context's `selection_<id>` module (dispatch_
// transform_feeds) and a `connection/update_resource` mutation on a
// feeding resource (dispatch_transform_feeds_from_resource) -- same "re
// -run whenever what I'm fed changes" idea, just two different kinds of
// change to watch for; and components/SinkWiringPanel.vue itself, once,
// right after a new feed is created (mirrors ConnectScopeModal.vue's own
// send_selection_to_sink-immediately-on-connect for sink links).
import { resolve_origin } from './originResolve';
import { send_selection_to_sink } from './sinkDispatch';
import { enter_dispatch, exit_dispatch } from './dispatchGuard';

export function dispatch_transform_feeds(store, originContextId) {
    for(const {transformId} of store.getters['transforms/feedsFrom'](originContextId)) {
        run_transform_and_dispatch(store, transformId);
    }
}

export function dispatch_transform_feeds_from_resource(store, resourceName) {
    for(const {transformId} of store.getters['transforms/feedsFromResource'](resourceName)) {
        run_transform_and_dispatch(store, transformId);
    }
}

function run_transform_and_dispatch(store, transformId) {
    // See dispatchGuard.js: refuses to re-run this same transform if it's
    // already running higher up this same synchronous call chain (its own
    // output feeding back into one of its own feeds, directly or through
    // other hops) -- the only thing standing between a wiring cycle and an
    // unbounded recursive cascade.
    const guardId = `transform:${transformId}`;
    if(!enter_dispatch(guardId)) return;
    try {
        log_transform_preview(store, transformId);

        for(const {linkId} of store.getters['transforms/outputLinksFrom'](transformId)) {
            try {
                send_selection_to_sink(store, {originContextId: transformId, linkId});
            } catch(error) {
                console.warn(`Transform output dispatch "${transformId}" (${linkId}) failed:`, error);
            }
        }
    } finally {
        exit_dispatch(guardId);
    }
}

function log_transform_preview(store, transformId) {
    const transform = store.getters['transforms/transform'](transformId);
    if(!transform) return;

    if(!transform.enabled) {
        console.info(`Transform "${transform.name}" is disabled (imported, needs review) -- skipped.`);
        return;
    }

    const origin = resolve_origin(store, transformId);
    for(const item of origin?.buildSinkSnapshot?.(store, transformId) ?? []) {
        console.log(`[transform:${transform.name}] ${item.itemId} ->`, item.snapshot);
    }
}
