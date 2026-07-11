import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {cors: {
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204
  }},
  build: {
    // some dev-only tweaks
    sourcemap: true,
    // Disables minification (saves massive CPU time)
    minify: false,
    // Skips heavy CSS code splitting
    cssCodeSplit: false,
    // Skips asset optimization calculations
    assetsInlineLimit: 0,
    rollupOptions: {
      // Drastically speeds up building by avoiding tree-shaking overhead
      treeshake: false,
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
  //css: {
  //  devSourcemap: true,
  //},
})
