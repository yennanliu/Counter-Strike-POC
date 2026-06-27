import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Resolve colyseus.js's ESM build explicitly. Vite resolves the package's
// "browser"/"require" condition (build/cjs), which misbehaves inside a vitest
// worker; the node ESM build (what `import()` picks in plain Node) works. Point
// the alias straight at it. Resolved via the server package so it works
// regardless of pnpm's hashed store paths.
const reqFromServer = createRequire(
  new URL("./packages/server/package.json", import.meta.url),
);
const colyseusClientEsm = join(
  dirname(reqFromServer.resolve("colyseus.js/package.json")),
  "build/esm/index.mjs",
);

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    alias: {
      "colyseus.js": colyseusClientEsm,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The shared deterministic sim is the critical, pure core — hold it to a
      // high bar (implementation-plan.md §0.2). Everything else is best-effort.
      include: ["packages/shared/src/sim/**"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
