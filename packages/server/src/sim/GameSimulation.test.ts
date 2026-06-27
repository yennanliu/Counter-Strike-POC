import { describe, it, expect } from "vitest";
import { GameSimulation } from "./GameSimulation.js";
import type { Arena } from "./GameSimulation.js";
import { vec3, PLAYER_SPEED, TICK_DT } from "@cs/shared";

const flatArena: Arena = {
  spawns: [vec3(0, 0, 0), vec3(10, 0, 0), vec3(0, 0, 10), vec3(10, 0, 10), vec3(5, 0, 5)],
  colliders: [],
};

describe("GameSimulation — join & spawn", () => {
  it("places a joining player at a spawn point", () => {
    const sim = new GameSimulation(flatArena);
    const p = sim.addPlayer("a");
    expect(flatArena.spawns).toContainEqual(p.pos);
    expect(sim.get("a")).toBe(p);
  });

  it("assigns distinct spawns and alternating teams", () => {
    const sim = new GameSimulation(flatArena);
    const a = sim.addPlayer("a");
    const b = sim.addPlayer("b");
    expect(a.pos).not.toEqual(b.pos);
    expect(a.team).not.toBe(b.team);
  });

  it("removes a player", () => {
    const sim = new GameSimulation(flatArena);
    sim.addPlayer("a");
    sim.removePlayer("a");
    expect(sim.get("a")).toBeUndefined();
  });
});

describe("GameSimulation — T-031: one input advances exactly one sim step", () => {
  it("moves the player by speed*TICK_DT and records the seq", () => {
    const sim = new GameSimulation(flatArena);
    const p = sim.addPlayer("a");
    const startZ = p.pos.z;
    const applied = sim.applyInput("a", { seq: 1, moveVec: { x: 0, z: 1 }, yaw: 0 });
    expect(applied).toBe(true);
    expect(sim.get("a")!.pos.z).toBeCloseTo(startZ + PLAYER_SPEED * TICK_DT);
    expect(sim.get("a")!.lastSeq).toBe(1);
  });

  it("ignores stale / duplicate sequence numbers", () => {
    const sim = new GameSimulation(flatArena);
    sim.addPlayer("a");
    sim.applyInput("a", { seq: 5, moveVec: { x: 0, z: 1 }, yaw: 0 });
    const posAfter5 = { ...sim.get("a")!.pos };
    // replayed/out-of-order inputs must not move the player again
    expect(sim.applyInput("a", { seq: 5, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(false);
    expect(sim.applyInput("a", { seq: 3, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(false);
    expect(sim.get("a")!.pos).toEqual(posAfter5);
  });

  it("returns false for an unknown player", () => {
    const sim = new GameSimulation(flatArena);
    expect(sim.applyInput("ghost", { seq: 1, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(false);
  });
});

describe("GameSimulation — T-032: illegal input is clamped", () => {
  it("caps an oversized (speed-hack) move vector to PLAYER_SPEED", () => {
    const sim = new GameSimulation(flatArena);
    const p = sim.addPlayer("a");
    const start = { ...p.pos };
    sim.applyInput("a", { seq: 1, moveVec: { x: 1000, z: 1000 }, yaw: 0 });
    const moved = sim.get("a")!.pos;
    const dist = Math.hypot(moved.x - start.x, moved.z - start.z);
    expect(dist).toBeLessThanOrEqual(PLAYER_SPEED * TICK_DT + 1e-9);
  });
});
