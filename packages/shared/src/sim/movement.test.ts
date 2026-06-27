import { describe, it, expect } from "vitest";
import { stepMovement, type AABB } from "./movement.js";
import { vec3 } from "./math.js";
import { PLAYER_SPEED, PLAYER_RADIUS, TICK_DT } from "./constants.js";

const dt = TICK_DT;
const noColliders = { colliders: [] as AABB[] };

describe("stepMovement — T-010: advances by speed × dt in the facing frame", () => {
  it("moves forward along +Z at yaw 0", () => {
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 0, z: 1 }, yaw: 0, dt },
      noColliders,
    );
    expect(next.x).toBeCloseTo(0);
    expect(next.z).toBeCloseTo(PLAYER_SPEED * dt);
    expect(next.y).toBe(0);
  });

  it("rotates the move into world space by yaw (forward → +X at yaw=π/2)", () => {
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 0, z: 1 }, yaw: Math.PI / 2, dt },
      noColliders,
    );
    expect(next.x).toBeCloseTo(PLAYER_SPEED * dt);
    expect(next.z).toBeCloseTo(0);
  });

  it("clamps diagonal input so you can't move faster than PLAYER_SPEED", () => {
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 1, z: 1 }, yaw: 0, dt },
      noColliders,
    );
    const dist = Math.hypot(next.x, next.z);
    expect(dist).toBeCloseTo(PLAYER_SPEED * dt);
  });

  it("does not mutate the input position", () => {
    const start = vec3(0, 0, 0);
    stepMovement(start, { moveVec: { x: 0, z: 1 }, yaw: 0, dt }, noColliders);
    expect(start).toEqual(vec3(0, 0, 0));
  });
});

describe("stepMovement — T-011: collision clamps, no tunneling", () => {
  const wall: AABB = { min: vec3(-5, 0, 1), max: vec3(5, 3, 1.5) };

  it("stops at the wall face even with an overshooting dt", () => {
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 0, z: 1 }, yaw: 0, dt: 10 }, // huge step would tunnel through
      { colliders: [wall] },
    );
    // front of player (radius) should rest against the wall's near face (z=1)
    expect(next.z).toBeCloseTo(1 - PLAYER_RADIUS);
    expect(next.z).toBeLessThanOrEqual(1 - PLAYER_RADIUS + 1e-9);
  });

  it("lets you move freely away from the wall", () => {
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 0, z: -1 }, yaw: 0, dt },
      { colliders: [wall] },
    );
    expect(next.z).toBeCloseTo(-PLAYER_SPEED * dt);
  });

  it("clamps when moving in the negative direction into a wall", () => {
    const back: AABB = { min: vec3(-5, 0, -1.5), max: vec3(5, 3, -1) };
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 0, z: -1 }, yaw: 0, dt: 10 }, // overshoot toward -Z
      { colliders: [back] },
    );
    expect(next.z).toBeCloseTo(-1 + PLAYER_RADIUS); // rests against far face z=-1
  });

  it("clamps on the X axis too", () => {
    const sideWall: AABB = { min: vec3(1, 0, -5), max: vec3(1.5, 3, 5) };
    const next = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 1, z: 0 }, yaw: 0, dt: 10 }, // strafe +X into wall
      { colliders: [sideWall] },
    );
    expect(next.x).toBeCloseTo(1 - PLAYER_RADIUS);
  });
});

describe("stepMovement — T-012: determinism", () => {
  const wall: AABB = { min: vec3(2, 0, -5), max: vec3(2.5, 3, 5) };
  const ctx = { colliders: [wall] };

  function runSequence() {
    let p = vec3(0, 0, 0);
    for (let i = 0; i < 100; i++) {
      const yaw = (i % 8) * (Math.PI / 4);
      p = stepMovement(p, { moveVec: { x: 0.3, z: 1 }, yaw, dt }, ctx);
    }
    return p;
  }

  it("produces identical output for identical input across runs", () => {
    expect(runSequence()).toEqual(runSequence());
  });
});
