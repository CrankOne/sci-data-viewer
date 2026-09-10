// Compiles and runs a user-authored transform record (store/modules/
// transforms.js) as a fan-in: one call per re-evaluation, not one per item.
// Kept separate from that store module and from transformDispatch.js: this
// file is pure (store, DOM, console -- none of it), the one piece worth
// unit-testing in isolation if that ever happens.
//
// Executing arbitrary user-typed JS via `new Function` is the same trust
// level as a browser JS console -- the source only ever comes from this
// same browser's own CodeMirror editor (components/modals/
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
const compiledCache = new Map(); // "label,label,...|source" -> Function | Error

// `labels` (store/modules/transforms.js's a/b/c/...) can't be baked into
// `new Function`'s own fixed parameter list -- how many there are, and
// which letters, changes as feeds are added/removed. Instead the compiled
// function always takes one `inputs` object, and destructures it into the
// requested bare names as its first statement -- `const {a, b} = inputs;`
// -- so the user's own source can still refer to `a`/`b` directly rather
// than `inputs.a`/`inputs.b`. Built from `labels` via a plain join, never
// from anything user-authored, so this has nothing to sanitize; guard_loops
// below only ever scans the user's own source text, never this prefix.
function compile_transform(source, labels) {
    const cacheKey = `${labels.join(',')}|${source}`;
    if(compiledCache.has(cacheKey)) return compiledCache.get(cacheKey);

    const destructure = labels.length ? `const {${labels.join(', ')}} = inputs;\n` : '';
    let compiled;
    try {
        compiled = new Function('inputs', 'ctx', '__txDeadline', destructure + guard_loops(source));
    } catch(error) {
        // The guard's rewrite is a crude textual scan, not a real parser --
        // if it ever produces source that fails to compile, fall back to
        // the user's original (unguarded) source rather than reporting a
        // confusing compile error for code that was actually fine.
        try {
            compiled = new Function('inputs', 'ctx', '__txDeadline', destructure + source);
        } catch(originalError) {
            compiled = originalError;
        }
    }
    compiledCache.set(cacheKey, compiled);
    return compiled;
}

// `inputs`: `{[label]: snapshot[]}`, one entry per currently-connected feed
// (store/originResolve.js's transform_snapshot builds this) -- always an
// array, even for a single current item, so a multi-selected feed is never
// silently narrowed to just one. `ctx` mirrors it one-for-one, port for
// port and index for index, but with each item's `{itemId, srcID,
// payloadType}` instead of its `snapshot` -- `ctx` itself is passed whole
// rather than destructured like `inputs` is, so `ctx.b` on a port that
// isn't currently connected is just `undefined`, not a ReferenceError the
// way a bare, un-destructured `b` would be. Runs the whole transform
// exactly once, not once per item -- the point of a fan-in is considering
// every connected port's current items together and producing one combined
// result. Never throws: a compile error or a runtime error is reported
// back as `{error}` instead, so a typo mid-edit doesn't do anything worse
// than log a warning (store/originResolve.js) and produce no output.
export function run_transform(transform, inputs, ctx) {
    const labels = Object.keys(inputs);
    const compiled = compile_transform(transform.source, labels);
    if(compiled instanceof Error) return {error: compiled};

    const deadline = Date.now() + TIME_LIMIT_MS;
    try {
        return {result: compiled(inputs, ctx, deadline)};
    } catch(error) {
        return {error};
    }
}
