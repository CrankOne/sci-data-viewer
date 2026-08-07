import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
    const isDev = mode === 'development';

    return {
        plugins: [vue()],
        server: {
            cors: {
                origin: "*",
                methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
                preflightContinue: false,
                optionsSuccessStatus: 204
            }
        },
        build: {
            sourcemap: true,
            // The tweaks below trade output size/correctness for build speed,
            // so they're only worth it for local dev rebuilds -- a real
            // production build should get Vite's normal optimized output.
            ...(isDev && {
                // Disables minification (saves massive CPU time)
                minify: false,
                // Skips heavy CSS code splitting
                cssCodeSplit: false,
                // Skips asset optimization calculations
                assetsInlineLimit: 0,
                rollupOptions: {
                    // Drastically speeds up building by avoiding tree-shaking overhead
                    treeshake: false
                }
            })
        },
        resolve: {
            alias: {
                "@": fileURLToPath(new URL("./src", import.meta.url))
            }
        }
        //css: {
        //  devSourcemap: true,
        //},
    };
});
