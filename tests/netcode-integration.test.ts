import { describe, it, expect } from "vitest";
import { GameSimulation, DEFAULT_ARENA } from "@cs/server";
import { Predictor } from "@cs/client";
import type { InputCommand, AABB } from "@cs/shared";

/**
 * P2 exit criterion — two scripted clients converge with the authoritative
 * server. Each client predicts locally with NO map-collision knowledge (so it
 * over-predicts into the central pillar), sends inputs to the server, and
 * reconciles against the server's clamped, authoritative position. After the run
 * each client's predicted position must match the server's for that player.
 *
 * Pure and deterministic — no sockets, no timers — so it can never flake.
 */
describe("netcode: client prediction converges with server authority", () => {
  it("both clients end at the server's authoritative position", () => {
    const sim = new GameSimulation(DEFAULT_ARENA);
    const aSpawn = sim.addPlayer("a");
    const bSpawn = sim.addPlayer("b");

    // Naive clients: they don't model the pillar, forcing reconciliation to correct them.
    const naive = { colliders: [] as AABB[] };
    const predA = new Predictor(aSpawn.pos, naive);
    const predB = new Predictor(bSpawn.pos, naive);

    // Walk both toward the center (where the pillar is), 60 ticks.
    const towardCenterA = { x: 1, z: 1 }; // a spawns at (-6,*,-6)
    const towardCenterB = { x: -1, z: -1 }; // b spawns at (6,*,6)

    let diverged = false;
    for (let i = 0; i < 60; i++) {
      const seq = i + 1;
      const cmdA: InputCommand = { seq, moveVec: towardCenterA, yaw: 0 };
      const cmdB: InputCommand = { seq, moveVec: towardCenterB, yaw: 0 };

      predA.predict(cmdA);
      predB.predict(cmdB);
      sim.applyInput("a", cmdA);
      sim.applyInput("b", cmdB);

      // Detect that prediction actually diverged from authority at least once
      // (proves the test exercises correction, not a trivial match).
      if (Math.abs(predA.position.z - sim.get("a")!.pos.z) > 1e-6) diverged = true;

      predA.reconcile({ pos: sim.get("a")!.pos, lastProcessedSeq: seq });
      predB.reconcile({ pos: sim.get("b")!.pos, lastProcessedSeq: seq });
    }

    expect(diverged).toBe(true);

    for (const [pred, id] of [
      [predA, "a"],
      [predB, "b"],
    ] as const) {
      const server = sim.get(id)!.pos;
      expect(pred.position.x).toBeCloseTo(server.x, 9);
      expect(pred.position.y).toBeCloseTo(server.y, 9);
      expect(pred.position.z).toBeCloseTo(server.z, 9);
    }

    // Sanity: players were actually stopped by the pillar (|coord| ~ 1 + radius), not at spawn.
    expect(Math.abs(sim.get("a")!.pos.x)).toBeLessThan(6);
    expect(Math.abs(sim.get("a")!.pos.x)).toBeGreaterThan(1);
  });
});
