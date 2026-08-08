// Common application state module (theme, and future cross-module settings).
export default {
    namespaced: true,
    state: () => ({
        theme: localStorage.getItem("theme") ?? "dark"
    }),
    mutations: {
        set_theme(state, theme) {
            state.theme = theme;
            document.documentElement.dataset.theme = theme;
            localStorage.setItem("theme", theme);
        }
    }
};
