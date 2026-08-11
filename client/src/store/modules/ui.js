// Generic, app-wide modal state. Any component opens a modal by name (see
// modules/modals.js for the name -> component catalog) without needing to
// know anything about ModalHost.vue, which is the sole renderer.
export default {
    namespaced: true,

    state: () => ({
        // {name, props, blocking} | null
        modal: null
    }),

    mutations: {
        open_modal(state, {name, props = {}, blocking = false}) {
            state.modal = {name, props, blocking};
        },

        close_modal(state) {
            state.modal = null;
        }
    }
};
