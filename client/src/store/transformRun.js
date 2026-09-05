// Compiles and runs a user-authored transform record (store/modules/
// transforms.js) against a list of resolved sink items. Kept separate from
// that store module and from transformDispatch.js: this file is pure
// (store, DOM, console -- none of it), the one piece worth unit-testing in
// isolation if that ever happens.
//
// Executing arbitrary user-typed JS via `new Function` is the same trust
// level as a browser JS console -- the source only ever comes from this
// same browser's own CodeFlask editor (components/modals/
// TransformEditorModal.vue) or, disabled until explicitly re-enabled, from
// an imported session file (sessionExport.js's disable_imported_transforms).
// It is never fetched from a remote endpoint or executed against data the
// user hasn't themselves selected.
//
// That trust doesn't cover an *accidental* infinite loop (a typo while
// editing, e.g. `while(true){}`) locking up the page -- transformLoopGuard.js
// rewrites the source to bound every loop it finds to TIME_LIMIT_MS, wall
// clock, checked on every iteration.
import { guard_loops } from './transformLoopGuard';

const TIME_LIMIT_MS = 5000;
const compiledCache = new Map(); // source string -> Function | Error

function compile_transform(source) {
    if(compiledCache.has(source)) return compiledCache.get(source);
    let compiled;
    try {
        compiled = new Function('item', 'ctx', '__txDeadline', guard_loops(source));
    } catch(error) {
        // The guard's rewrite is a crude textual scan, not a real parser --
        // if it ever produces source that fails to compile, fall back to
        // the user's original (unguarded) source rather than reporting a
        // confusing compile error for code that was actually fine.
        try {
            compiled = new Function('item', 'ctx', '__txDeadline', source);
        } catch(originalError) {
            compiled = originalError;
        }
    }
    compiledCache.set(source, compiled);
    return compiled;
}

// `items`: whatever a module's own buildSinkSnapshot returns (modules/
// registry.js's contract) -- {itemId, srcID, originRef, payloadType,
// snapshot}. Runs one-to-one, same shape sink links themselves forward in.
// Never throws: a compile error or a per-item runtime error is reported
// back as `{item, error}` instead, so one bad item (or a typo mid-edit)
// doesn't take out the whole batch.
export function run_transform(transform, items) {
    const compiled = compile_transform(transform.source);
    if(compiled instanceof Error) {
        return items.map(item => ({item, error: compiled}));
    }
    // One shared deadline for the whole batch, not one per item -- a
    // pathological transform fed N items shouldn't get N * TIME_LIMIT_MS.
    const deadline = Date.now() + TIME_LIMIT_MS;
    return items.map(item => {
        try {
            const result = compiled(item.snapshot, {itemId: item.itemId, srcID: item.srcID, payloadType: item.payloadType}, deadline);
            return {item, result};
        } catch(error) {
            return {item, error};
        }
    });
}
