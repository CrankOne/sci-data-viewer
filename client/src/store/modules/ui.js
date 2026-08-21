// Generic, app-wide modal state. Any component opens a modal by name (see
// modules/modals.js for the name -> component catalog) without needing to
// know anything about ModalHost.vue, which is the sole renderer.
export default {
    namespaced: true,

    state: () => ({
        // {name, props, blocking} | null
        modal: null,
        // 'row' | 'column' | null -- button-triggered panel-split mode
        // (AppControls.vue's split buttons, components/SplitModeOverlay.vue),
        // replacing the old shift-drag-to-split gesture. 'row' splits the
        // hovered panel left/right, 'column' top/bottom -- same direction
        // vocabulary as store/modules/layout.js's split nodes.
        splitMode: null
    }),

    mutations: {
        open_modal(state, {name, props = {}, blocking = false}) {
            state.modal = {name, props, blocking};
        },

        close_modal(state) {
            state.modal = null;
        },

        enter_split_mode(state, direction) {
            state.splitMode = direction;
        },

        exit_split_mode(state) {
            state.splitMode = null;
        }
    }
};
