import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P2 — GameRoom over the wire (T-030/031/032).
 *
 * The actual end-to-end checks (real Colyseus server + real colyseus.js client:
 * HTTP matchmaking, WebSocket state sync, input → authoritative step → synced
 * state, oversized-move clamp) live in ./wire-check.ts and run in a normal Node
 * process. We can't run them directly in a vitest worker — the colyseus.js client
 * can't hold a WebSocket there. So this test executes that script and asserts it
 * passed (exit 0 + WIRE_CHECK_OK). Pure game logic is covered separately in
 * GameSimulation.test.ts and the netcode integration test.
 */
const serverDir = fileURLToPath(new URL("../../", import.meta.url));
const script = fileURLToPath(new URL("./wire-check.ts", import.meta.url));

describe("GameRoom over the wire (real server + client)", () => {
  it("T-030/031/032: join → spawn, input → step, oversized move clamped", () => {
    let out = "";
    try {
      out = execFileSync(process.execPath, ["--import", "tsx", script], {
        cwd: serverDir,
        env: { ...process.env, TSX_TSCONFIG_PATH: join(serverDir, "tsconfig.json") },
        encoding: "utf8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      throw new Error(
        `wire-check failed:\n${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`,
      );
    }
    expect(out).toContain("WIRE_CHECK_OK");
  }, 35_000);
});
