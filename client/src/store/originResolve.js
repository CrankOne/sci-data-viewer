// A sink *origin* -- whatever a link record's originContextId names -- is
// either a real contextual module instance (store/modules/contexts.js) or,
// since stage 2 of the user-authored-transform feature (store/modules/
// transforms.js), a transform node. Both expose the same duck-typed
// interface modules/registry.js already defines for a real module
// (buildSinkSnapshot/resolveSinkItem) -- every caller that used to go
// straight to `get_module(contexts/context(id)?.dataType)` (store/
// sinkDispatch.js, store/sinkResolve.js) now comes through here instead,
// so a transform is just another kind of origin to them, no special
// -casing needed at the call site.
//
// A transform never feeds *another* transform (store/modules/transforms.js
// -- deliberately transform -> context only on the output side, no
// chaining yet), so resolving a transform's own input below only ever
// recurses into a real context or a resource, never back into this
// function a second level deep. Written via resolve_origin anyway rather
// than calling get_module directly, so lifting that restriction later
// costs nothing here.
import { get_module } from '@/modules/registry';
import { run_transform } from './transformRun';

export function resolve_origin(store, originId) {
    const context = store.getters['contexts/context'](originId);
    if(context) return get_module(context.dataType);

    const transform = store.getters['transforms/transform'](originId);
    if(transform) return make_transform_origin(transform);

    return null;
}

// The other half of "a transform is just another origin": resolves the
// outgoing *link* record itself, regardless of whether it's a context's
// own sinkLinks entry or a transform's own outputLinks entry -- both have
// the exact same shape ({targetDataType, targetContextId, payloadType,
// facetsSelector}), store/sinkDispatch.js's deliver_to_sink doesn't care
// which kind of record it got.
export function resolve_outgoing_link(store, originId, linkId) {
    const context = store.getters['contexts/context'](originId);
    if(context) return context.sinkLinks?.[linkId] ?? null;

    const transform = store.getters['transforms/transform'](originId);
    return transform?.outputLinks?.[linkId] ?? null;
}

// A transform's own "current items" are whatever its feeding context(s)
// currently select and/or its feeding resource(s) currently hold (store/
// modules/transforms.js's two feed kinds), gathered by label (a/b/c/...,
// each an array -- a feed's origin can select/hold more than one) and run
// through the transform's own function *once* as a fan-in, not once per
// item -- always recomputed fresh (never cached, same as every other
// resolution in this app), so editing the transform's source or any
// feed's upstream selection/resource data is reflected immediately.
//
// Combining several feeds' worth of items loses whatever single identity
// (itemId/srcID/originRef) any *one* of them had -- there's no longer one
// underlying item to inherit it from -- so the combined result mints its
// own instead, fixed to the transform's own id: exactly one logical output
// "slot" per transform, the same way a resource's own snapshot
// (resource_snapshot below) is always exactly one item keyed by the
// resource's own name. `payloadType: '*'` for the same reason -- a
// fan-in's output is a newly-synthesized shape, not transparently "the same
// kind of thing" any one input was, so store/sinkDispatch.js's own
// deliver_to_sink can only ever match it against a wildcard-accepting
// link (e.g. the JSON viewer's), never masquerade as a specific typed
// payload it isn't.
function make_transform_origin(transform) {
    return {
        buildSinkSnapshot: (store, transformId) => transform_snapshot(store, transformId, transform),
        resolveSinkItem: (store, transformId, originRef) =>
            transform_snapshot(store, transformId, transform).find(item => item.originRef === originRef) ?? null
    };
}

function transform_snapshot(store, transformId, transform) {
    // A disabled transform (imported, awaiting explicit review -- see
    // sessionExport.js's disable_imported_transforms) never runs, for
    // either of its two triggers (store/transformDispatch.js's console
    // preview, or a real outputLinks delivery here) -- not just skipped at
    // the point something is *about* to log/deliver.
    if(!transform.enabled) return [];

    const feeds = store.getters['transforms/feedsInto'](transformId);
    // Nothing wired in yet (a freshly-created transform, or every feed just
    // removed) -- never even attempts to run: there's nothing sensible to
    // pass, and the transform's own source is free to reference whichever
    // ports it expects without guarding against them not existing yet.
    if(!feeds.length) return [];

    const inputs = {};
    const ctx = {};
    for(const feed of feeds) {
        const items = feed.resourceName
            ? resource_snapshot(store, feed.resourceName)
            : (resolve_origin(store, feed.originContextId)?.buildSinkSnapshot?.(store, feed.originContextId) ?? []);
        inputs[feed.label] = items.map(item => item.snapshot);
        // Same shape, same order as inputs[feed.label] -- ctx.a[i] is the
        // metadata for inputs.a[i], not its payload. Kept separate rather
        // than folded into each snapshot so a transform reading `a` never
        // has to know or care that this envelope exists.
        ctx[feed.label] = items.map(({itemId, srcID, payloadType}) => ({itemId, srcID, payloadType}));
    }

    const {result, error} = run_transform(transform, inputs, ctx);
    if(error) {
        console.warn(`Transform "${transform.name}" failed:`, error);
        return [];
    }
    return [{itemId: transformId, srcID: transformId, originRef: transformId, payloadType: '*', snapshot: result}];
}

// A resource-sourced feed's one current item: whatever the resource's own
// raw fetched body currently is (`resource.data`, unnormalized -- doc/
// data-model.rst's "plain" shape, no per-module envelope applied), plus,
// for an addressable source, the id it was last fetched by
// (`resource.selectedItemId`) -- `null` for a plain source, which never
// has one. Always exactly zero or one item: unlike a context's own
// buildSinkSnapshot (a whole selected set), a resource has no analogous
// "several things at once" concept here -- it's always "whatever's
// currently loaded, if anything".
function resource_snapshot(store, resourceName) {
    const resource = store.state.connection.resources[resourceName];
    if(!resource || resource.data == null) return [];
    return [{
        itemId: resource.selectedItemId ?? null,
        srcID: resource.name,
        originRef: resource.name,
        payloadType: resource.type,
        snapshot: resource.data
    }];
}
