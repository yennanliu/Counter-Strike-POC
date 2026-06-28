import { describe, it, expect } from "vitest";
import { GameSimulation } from "./GameSimulation.js";
import type { Arena } from "./GameSimulation.js";
import {
  vec3,
  PLAYER_SPEED,
  TICK_DT,
  PLAYER_MAX_HP,
  WEAPONS,
  HEADSHOT_MULTIPLIER,
  MAX_PLAYERS,
} from "@cs/shared";

const arena: Arena = {
  spawnsT: [vec3(0, 0, 0), vec3(2, 0, 0), vec3(4, 0, 0)],
  spawnsCT: [vec3(0, 0, 10), vec3(2, 0, 10), vec3(4, 0, 10)],
  colliders: [],
};

const newSim = () => new GameSimulation(arena);

describe("GameSimulation — join & spawn", () => {
  it("places a joining player at a team spawn point", () => {
    const sim = newSim();
    const p = sim.addPlayer("a");
    const all = [...arena.spawnsT, ...arena.spawnsCT];
    expect(all).toContainEqual(p.pos);
    expect(sim.get("a")).toBe(p);
    expect(p.hp).toBe(PLAYER_MAX_HP);
    expect(p.alive).toBe(true);
  });

  it("assigns alternating teams and distinct spawns", () => {
    const sim = newSim();
    const a = sim.addPlayer("a");
    const b = sim.addPlayer("b");
    expect(a.team).not.toBe(b.team);
    expect(a.pos).not.toEqual(b.pos);
  });

  it("removes a player", () => {
    const sim = newSim();
    sim.addPlayer("a");
    sim.removePlayer("a");
    expect(sim.get("a")).toBeUndefined();
  });
});

describe("GameSimulation — T-031: one input advances exactly one sim step", () => {
  it("moves the player by speed*TICK_DT and records the seq", () => {
    const sim = newSim();
    const p = sim.addPlayer("a");
    const startZ = p.pos.z;
    expect(sim.applyInput("a", { seq: 1, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(true);
    expect(sim.get("a")!.pos.z).toBeCloseTo(startZ + PLAYER_SPEED * TICK_DT);
    expect(sim.get("a")!.lastSeq).toBe(1);
  });

  it("ignores stale / duplicate sequence numbers", () => {
    const sim = newSim();
    sim.addPlayer("a");
    sim.applyInput("a", { seq: 5, moveVec: { x: 0, z: 1 }, yaw: 0 });
    const after5 = { ...sim.get("a")!.pos };
    expect(sim.applyInput("a", { seq: 5, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(false);
    expect(sim.applyInput("a", { seq: 3, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(false);
    expect(sim.get("a")!.pos).toEqual(after5);
  });

  it("returns false for an unknown player", () => {
    expect(newSim().applyInput("ghost", { seq: 1, moveVec: { x: 0, z: 1 }, yaw: 0 })).toBe(false);
  });
});

describe("GameSimulation — T-032: illegal input is clamped", () => {
  it("caps an oversized move vector to PLAYER_SPEED", () => {
    const sim = newSim();
    const p = sim.addPlayer("a");
    const start = { ...p.pos };
    sim.applyInput("a", { seq: 1, moveVec: { x: 1000, z: 1000 }, yaw: 0 });
    const moved = sim.get("a")!.pos;
    const dist = Math.hypot(moved.x - start.x, moved.z - start.z);
    expect(dist).toBeLessThanOrEqual(PLAYER_SPEED * TICK_DT + 1e-9);
  });
});

/** Position a player precisely for deterministic combat tests. */
function pose(sim: GameSimulation, id: string, x: number, y: number, z: number, yaw: number) {
  const p = sim.get(id)!;
  p.pos = vec3(x, y, z);
  p.yaw = yaw;
  p.pitch = 0;
}

describe("GameSimulation — T-050: combat (damage, headshot, death, kill credit)", () => {
  it("a horizontal eye-level shot is a headshot dealing damage×multiplier and can kill", () => {
    const sim = newSim();
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0); // facing +Z, eye at 1.6
    pose(sim, "target", 0, 0, 5, 0); // standing on ground → eye-level hit = head

    const res = sim.fireShot("shooter");
    expect(res.hit).toBe(true);
    expect(res.targetId).toBe("target");
    expect(res.isHead).toBe(true);
    expect(res.damage).toBeCloseTo(WEAPONS.rifle.damage * HEADSHOT_MULTIPLIER);
    expect(res.killed).toBe(true);

    const t = sim.get("target")!;
    expect(t.hp).toBe(0);
    expect(t.alive).toBe(false);
    expect(t.deaths).toBe(1);
    expect(sim.get("shooter")!.kills).toBe(1);
  });

  it("a body shot deals base damage and does not kill at full HP", () => {
    const sim = newSim();
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0);
    pose(sim, "target", 0, 1.0, 5, 0); // raised so the eye-level ray hits the body

    const res = sim.fireShot("shooter");
    expect(res.hit).toBe(true);
    expect(res.isHead).toBe(false);
    expect(res.damage).toBeCloseTo(WEAPONS.rifle.damage);
    expect(res.killed).toBe(false);
    expect(sim.get("target")!.hp).toBeCloseTo(PLAYER_MAX_HP - WEAPONS.rifle.damage);
    expect(sim.get("target")!.alive).toBe(true);
  });

  it("a wall between shooter and target blocks the shot", () => {
    const sim = new GameSimulation({
      ...arena,
      colliders: [{ min: vec3(-5, 0, 2), max: vec3(5, 3, 2.5) }],
    });
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0);
    pose(sim, "target", 0, 0, 5, 0);
    expect(sim.fireShot("shooter").hit).toBe(false);
    expect(sim.get("target")!.hp).toBe(PLAYER_MAX_HP);
  });

  it("credits an assist to a player who damaged but did not get the kill", () => {
    const sim = newSim();
    sim.addPlayer("A");
    sim.addPlayer("B");
    sim.addPlayer("victim");
    pose(sim, "A", 0, 0, 0, 0); // body-shots the raised victim
    pose(sim, "B", 10, 1.0, 5, -Math.PI / 2); // eye 2.6, faces -X → headshots victim
    pose(sim, "victim", 0, 1.0, 5, 0);

    expect(sim.fireShot("A").killed).toBe(false); // 30 dmg → 70
    expect(sim.fireShot("B").killed).toBe(true); // headshot 120 → dead

    expect(sim.get("victim")!.deaths).toBe(1);
    expect(sim.get("B")!.kills).toBe(1);
    expect(sim.get("A")!.kills).toBe(0);
    expect(sim.get("A")!.assists).toBe(1);
  });

  it("dead players cannot be hit and cannot shoot", () => {
    const sim = newSim();
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0);
    pose(sim, "target", 0, 0, 5, 0);
    sim.fireShot("shooter"); // kills target
    expect(sim.fireShot("shooter").hit).toBe(false); // target no longer targetable
    sim.get("shooter")!.alive = false;
    expect(sim.fireShot("shooter").hit).toBe(false); // dead shooter can't fire
  });

  it("does not fire while firing is disabled (e.g. freeze phase)", () => {
    const sim = newSim();
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0);
    pose(sim, "target", 0, 0, 5, 0);
    sim.firingEnabled = false;
    const res = sim.fireShot("shooter");
    expect(res.fired).toBe(false);
    expect(res.hit).toBe(false);
    expect(sim.get("target")!.hp).toBe(PLAYER_MAX_HP);
  });

  it("reports trajectory geometry (origin at the eye, end at the impact / range)", () => {
    const sim = newSim();
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0);
    pose(sim, "target", 0, 0, 5, 0);

    const hit = sim.fireShot("shooter");
    expect(hit.fired).toBe(true);
    expect(hit.hit).toBe(true);
    expect(hit.origin.y).toBeGreaterThan(0); // eye height
    expect(hit.end.z).toBeGreaterThan(0); // impact point in front

    // miss → end is out at weapon range, well past where the target was
    pose(sim, "shooter", 0, 0, 0, Math.PI); // face away
    sim.get("target")!.alive = true;
    const miss = sim.fireShot("shooter");
    expect(miss.fired).toBe(true);
    expect(miss.hit).toBe(false);
    expect(Math.hypot(miss.end.x - miss.origin.x, miss.end.z - miss.origin.z)).toBeGreaterThan(10);
  });
});

describe("GameSimulation — respawn", () => {
  it("respawnAll resets HP/alive/position and clears damage ledger, keeping K/D/A", () => {
    const sim = newSim();
    sim.addPlayer("shooter");
    sim.addPlayer("target");
    pose(sim, "shooter", 0, 0, 0, 0);
    pose(sim, "target", 0, 0, 5, 0);
    sim.fireShot("shooter");
    expect(sim.get("target")!.alive).toBe(false);

    sim.respawnAll();
    const t = sim.get("target")!;
    expect(t.alive).toBe(true);
    expect(t.hp).toBe(PLAYER_MAX_HP);
    expect(t.pos).toEqual(t.spawn);
    expect(t.deaths).toBe(1); // cumulative stats survive
    expect(sim.get("shooter")!.kills).toBe(1);
  });
});

describe("GameSimulation — T-051: 5-player cap", () => {
  it("accepts up to MAX_PLAYERS and rejects the next join", () => {
    const sim = newSim();
    for (let i = 0; i < MAX_PLAYERS; i++) sim.addPlayer(`p${i}`);
    expect(sim.canAddPlayer()).toBe(false);
    expect(() => sim.addPlayer("overflow")).toThrow();
    expect(sim.players.size).toBe(MAX_PLAYERS);
  });
});
