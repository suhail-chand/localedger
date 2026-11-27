import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/localedger/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png"],
      manifest: {
        name: "Localedger",
        short_name: "Localedger",
        description: "Local-first personal finance tracker",
        theme_color: "#1f2937",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "./",
        scope: "./",
      },
    }),
  ],
});
