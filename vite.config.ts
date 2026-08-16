import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Peruse is a local-first app. No proxying, no backend — everything runs on-device.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Cross-origin isolation lets us use SharedArrayBuffer / WASM threads for
    // the on-device vision model when available. Harmless otherwise.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
  // Keep the optional AI runtime out of the dependency pre-bundle so the app
  // starts instantly and the model stack is only pulled in on demand.
  optimizeDeps: {
    exclude: ["@xenova/transformers"],
  },
});
