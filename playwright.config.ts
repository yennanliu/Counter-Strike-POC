import { defineConfig } from "@playwright/test";

/**
 * E2E config. Boots the real game server (ws://localhost:2567) and the Vite dev
 * server (http://localhost:5173), then runs browser tests against them. Per the
 * plan, E2E runs separately from `pnpm test` (nightly / pre-release).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:5173" },
  webServer: [
    {
      command: "pnpm --filter @cs/server start",
      port: 2567,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @cs/client dev",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
