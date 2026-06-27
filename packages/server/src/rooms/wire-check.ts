/**
 * End-to-end wire check for GameRoom, run as a standalone process (see
 * GameRoom.test.ts, which executes this and asserts on its exit code).
 *
 * It runs in a normal Node process — NOT a vitest worker — because the
 * colyseus.js client cannot hold a WebSocket inside a vitest worker (HTTP
 * matchmaking works but the ws upgrade errors). In plain Node the real
 * server + real client work exactly as in production.
 *
 * Exits 0 and prints WIRE_CHECK_OK on success; exits 1 with a reason otherwise.
 */
import assert from "node:assert/strict";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { appConfig } from "../app.config.js";
import type { GameState } from "../state/schema.js";
import { PLAYER_SPEED, TICK_DT } from "@cs/shared";

const PORT = 2576;
const ENDPOINT = `ws://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if (pred()) return;
    } catch {
      /* state field not present yet */
    }
    await sleep(20);
  }
  throw new Error("timeout waiting for condition");
}

const server = new Server({ transport: new WebSocketTransport() });
appConfig.initializeGameServer(server);
await server.listen(PORT);

try {
  // T-030: join → spawn appears in synced state with a team.
  const c1 = new Client(ENDPOINT);
  const r1 = await c1.create<GameState>("game", { mapId: "arena" });
  await until(() => r1.state.players.get(r1.sessionId) !== undefined);
  assert.equal(r1.state.players.size, 1, "one player after join");
  const me = r1.state.players.get(r1.sessionId)!;
  assert.ok(me.team === "T" || me.team === "CT", "team assigned");

  // T-031: an input advances the player and acks the seq.
  const beforeZ = me.z;
  r1.send("input", { seq: 1, moveVec: { x: 0, z: 1 }, yaw: 0 });
  await until(() => r1.state.players.get(r1.sessionId)!.lastProcessedSeq === 1);
  assert.notEqual(
    r1.state.players.get(r1.sessionId)!.z,
    beforeZ,
    "player moved on input",
  );
  await r1.leave();

  // T-032: an oversized move vector is clamped to PLAYER_SPEED.
  const c2 = new Client(ENDPOINT);
  const r2 = await c2.create<GameState>("game", {});
  await until(() => r2.state.players.get(r2.sessionId) !== undefined);
  const p = r2.state.players.get(r2.sessionId)!;
  const sx = p.x;
  const sz = p.z;
  r2.send("input", { seq: 1, moveVec: { x: 1000, z: 1000 }, yaw: 0 });
  await until(() => r2.state.players.get(r2.sessionId)!.lastProcessedSeq === 1);
  const after = r2.state.players.get(r2.sessionId)!;
  const dist = Math.hypot(after.x - sx, after.z - sz);
  assert.ok(
    dist <= PLAYER_SPEED * TICK_DT + 1e-6,
    `oversized move clamped (dist=${dist})`,
  );
  await r2.leave();

  console.log("WIRE_CHECK_OK");
  await server.gracefullyShutdown(false);
  process.exit(0);
} catch (err) {
  console.error("WIRE_CHECK_FAIL:", err instanceof Error ? err.message : err);
  try {
    await server.gracefullyShutdown(false);
  } catch {
    /* ignore */
  }
  process.exit(1);
}
