import { describe, it, expect } from "vitest";
import { TICK_RATE } from "@cs/shared";
import { clientConfig } from "@cs/client";
import { serverConfig } from "@cs/server";

/**
 * T-001 (P0) — Walking-skeleton contract test.
 *
 * Proves the whole monorepo wiring works end to end: the `shared` package is the
 * single source of truth, and BOTH `client` and `server` resolve and reuse the
 * exact same value. If the workspace links or the shared module break, this fails.
 */
describe("client/server share the same simulation tick rate", () => {
  it("client tick rate equals the shared constant", () => {
    expect(clientConfig.tickRate).toBe(TICK_RATE);
  });

  it("server tick rate equals the shared constant", () => {
    expect(serverConfig.tickRate).toBe(TICK_RATE);
  });

  it("client and server agree with each other", () => {
    expect(clientConfig.tickRate).toBe(serverConfig.tickRate);
  });
});
