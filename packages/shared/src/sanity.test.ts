import { describe, it, expect } from "vitest";

// P0: prove Vitest actually runs inside the shared package.
describe("vitest harness", () => {
  it("runs a trivial test", () => {
    expect(2 + 3).toBe(5);
  });
});
