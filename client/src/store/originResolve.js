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
// modules/transforms.js's two feed kinds), passed one-to-one through its
// own function -- always recomputed fresh (never cached, same as every
// other resolution in this app), so editing the transform's source or its
// upstream selection/resource data is reflected immediately. `originRef`
// is reused verbatim from the underlying item (a transform never mints its
// own item identity) -- resolveSinkItem below just recomputes the same
// list and finds it by that same key, exactly like a real module's own
// resolveSinkItem would.
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

    const items = store.getters['transforms/feedsInto'](transformId).flatMap(feed => {
        if(feed.resourceName) return resource_snapshot(store, feed.resourceName);
        const originModule = resolve_origin(store, feed.originContextId);
        return originModule?.buildSinkSnapshot ? originModule.buildSinkSnapshot(store, feed.originContextId) : [];
    });

    // Keeps `itemId`/`srcID`/`originRef`/`payloadType` from the underlying
    // item unchanged, replacing only `snapshot` -- a transform is
    // transparent for typing/filtering purposes (store/sinkDispatch.js's
    // deliver_to_sink still filters by the *original* payloadType/facets),
    // it only ever changes the shape of the data itself. A per-item error
    // (a typo mid-edit, e.g.) drops just that one item rather than the
    // whole batch, same as a module's own buildSinkSnapshot silently
    // omitting an item with nothing forwardable.
    return run_transform(transform, items).flatMap(({item, result, error}) => {
        if(error) {
            console.warn(`Transform "${transform.name}" failed on item "${item.itemId}":`, error);
            return [];
        }
        return [{...item, snapshot: result}];
    });
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
