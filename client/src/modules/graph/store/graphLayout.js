// Per-diagram (viewport instance) layout options (doc/module-graph.rst's
// "Diagrams"): direction/align/ranker/spacing, persisted across reload --
// mirrors modules/three-view/store/cameras.js's own per-viewport-instance
// shape closely enough to reuse the pattern, with one deliberate
// simplification: cameras.js additionally supports several *named* presets
// a viewport can switch between (a real three-view need); this module has
// no equivalent "named layouts to switch between" requirement, so each
// diagram instance owns exactly one options object directly, lazily
// created on first write rather than through an explicit
// register_viewport step threaded through every scene-creation call site
// the way cameras.js's own registration is (a smaller footprint for the
// same persisted-per-instance shape -- see this module's "Diagrams" doc
// section).
//
// A module-global (not per-context) Vuex module -- registered once via
// this module's own `storeModules` entry (modules/graph/index.js), the
// same way three-view registers `cameras` -- since several diagrams can
// render the same board with independent layout options.
import { make_default_layout_options } from '../layout';

const DIRECTIONS = ['TB', 'BT', 'LR', 'RL'];
const ALIGNMENTS = ['UL', 'UR', 'DL', 'DR'];
const RANKERS = ['network-simplex', 'tight-tree', 'longest-path'];

function sanitize_layout_options(options) {
    const defaults = make_default_layout_options();
    if(!options || typeof options !== 'object') return defaults;
    return {
        direction: DIRECTIONS.includes(options.direction) ? options.direction : defaults.direction,
        align: ALIGNMENTS.includes(options.align) ? options.align : null,
        ranker: RANKERS.includes(options.ranker) ? options.ranker : defaults.ranker,
        nodeSep: Number.isFinite(options.nodeSep) ? options.nodeSep : defaults.nodeSep,
        rankSep: Number.isFinite(options.rankSep) ? options.rankSep : defaults.rankSep,
        edgeSep: Number.isFinite(options.edgeSep) ? options.edgeSep : defaults.edgeSep
    };
}

export default {
    namespaced: true,

    state: () => ({
        byViewport: {} // viewportID -> sanitized layout options object
    }),

    getters: {
        // Falls back to `fallback` (typically make_default_layout_options()
        // merged with the board's own payload layout hint --
        // layout.js's merge_layout_defaults, "Diagrams" above) when this
        // viewport has no explicit local override yet.
        layoutOptions: state => (viewportID, fallback) =>
            state.byViewport[viewportID] ?? fallback ?? make_default_layout_options(),

        hasExplicitOptions: state => viewportID => Object.hasOwn(state.byViewport, viewportID)
    },

    mutations: {
        // Upsert: creates the viewport's entry on first call -- no separate
        // registration mutation needed, contrast cameras.js's
        // register_viewport (see this file's header comment).
        set_layout_options(state, {viewportID, patch}) {
            const current = state.byViewport[viewportID] ?? make_default_layout_options();
            state.byViewport = {
                ...state.byViewport,
                [viewportID]: sanitize_layout_options({...current, ...patch})
            };
        },

        // Called when a diagram viewport is removed (components/Panel.vue's
        // remove_module, mirroring its existing cameras/unregister_viewport
        // call) so a session's persisted storage doesn't grow unboundedly
        // across create/remove cycles. Harmless no-op for any other
        // (non-graph) viewport id, the same way cameras/unregister_viewport
        // already is.
        unregister_viewport(state, viewportID) {
            if(!Object.hasOwn(state.byViewport, viewportID)) return;
            const next = {...state.byViewport};
            delete next[viewportID];
            state.byViewport = next;
        },

        // (Re)initializes from persisted data (see graphLayoutPersistence.js).
        // Invalid entries are dropped rather than rejecting the whole
        // payload, since this may be untrusted data coming from local storage.
        initialize_layout_options(state, {byViewport}) {
            const sanitized = {};
            if(byViewport && typeof byViewport === 'object') {
                for(const [viewportID, options] of Object.entries(byViewport))
                    sanitized[viewportID] = sanitize_layout_options(options);
            }
            state.byViewport = sanitized;
        }
    }
};
