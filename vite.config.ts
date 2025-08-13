import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        content: "src/content/content.ts",
        background: "src/background.ts",
        popup: "src/popup/popup.ts",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
    emptyOutDir: true,
    sourcemap: true,
    target: "esnext",
  },
  publicDir: "public",
});
