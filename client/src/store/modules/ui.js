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
        splitMode: null,

        // Button-triggered "clean panel" mode (AppControls.vue's "Clean
        // panel" button, components/CleanModeOverlay.vue), mirroring
        // splitMode above -- replaces the old per-panel Remove button
        // (formerly PanelResidentChrome.vue's own corner button) with the
        // same click-a-panel gesture split mode already uses. No direction
        // variant needed, hence a plain boolean rather than splitMode's
        // 'row' | 'column' | null.
        cleanMode: false
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
        },

        enter_clean_mode(state) {
            state.cleanMode = true;
        },

        exit_clean_mode(state) {
            state.cleanMode = false;
        }
    }
};
