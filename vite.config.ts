import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: {
      "node:async_hooks": fileURLToPath(new URL("./src/shims/async-hooks.ts", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [
    tsconfigPaths(),
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
});
