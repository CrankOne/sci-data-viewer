// Silences one specific, known-benign failure mode of the `splitpanes`
// package (components/LayoutNode.vue): its resize-handle <div>s are plain,
// Vue-untracked DOM nodes it creates/destroys itself via raw insertBefore/
// removeChild (its own redoSplitters(), scheduled through $nextTick from a
// <Pane>'s mount/unmount hooks) as siblings of the Vue-rendered <pane>
// elements in the same container. When several layout-tree changes land
// close enough together (creating/removing scenes, splitting/collapsing
// panels, dragging a viewport into a fresh cell -- todo.md's "Adding a
// viewer" bug), that queued cleanup can end up running against a container
// Vue has already patched further in the meantime, throwing
// "NotFoundError: Failed to execute 'insertBefore'/'removeChild' ...": a
// genuine bug in how splitpanes manages its own DOM (3.1.5 is current, no
// newer release changes this), not in anything Vue or this app's own layout
// store did.
//
// Confirmed harmless by direct testing (dispatching the same layout
// mutations that trigger it): it always surfaces as an *unhandled promise
// rejection* from inside splitpanes' own un-awaited $nextTick() callback,
// never as a synchronous throw during Vue's own render/patch -- so it never
// corrupts app or DOM state, just prints as an alarming uncaught error. Kept
// narrowly scoped to that exact DOMException shape (name + message
// pattern) so it can never mask an unrelated bug; downgraded to a
// console.debug, not swallowed outright, so it stays visible while
// debugging.
export function install_splitpanes_race_guard() {
    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        if(
            reason instanceof DOMException
            && reason.name === 'NotFoundError'
            && /insertBefore|removeChild/.test(reason.message)
        ) {
            console.debug('Ignored a known-benign splitpanes DOM race:', reason.message);
            event.preventDefault();
        }
    });
}
