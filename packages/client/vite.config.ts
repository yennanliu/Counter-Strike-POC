import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
  // @cs/shared is a workspace package shipped as TS source — let Vite transform it
  // rather than trying to pre-bundle it.
  optimizeDeps: { exclude: ["@cs/shared"] },
  define: {
    // default server endpoint; override at build with VITE_SERVER_URL
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? "ws://localhost:2567"),
  },
});
