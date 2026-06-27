import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
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
