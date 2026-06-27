import { describe, it, expect } from "vitest";
import { raycast, type CapsuleTarget } from "./hitscan.js";
import type { AABB } from "./movement.js";
import { vec3 } from "./math.js";
import { PLAYER_RADIUS } from "./constants.js";

const targetB: CapsuleTarget = { id: "B", pos: vec3(0, 0, 5) };

describe("raycast — T-020", () => {
  it("hits a capsule and reports the entry distance", () => {
    const result = raycast(
      { origin: vec3(0, 1.0, 0), dir: vec3(0, 0, 1) },
      { targets: [targetB] },
    );
    expect(result.hit).toBe(true);
    expect(result.targetId).toBe("B");
    // ray enters the capsule's near face at z = 5 - radius
    expect(result.distance).toBeCloseTo(5 - PLAYER_RADIUS);
    expect(result.isHead).toBe(false); // chest-height shot
  });

  it("is blocked by a wall between shooter and target (no hit)", () => {
    const wall: AABB = { min: vec3(-5, 0, 2), max: vec3(5, 3, 2.5) };
    const result = raycast(
      { origin: vec3(0, 1.0, 0), dir: vec3(0, 0, 1) },
      { targets: [targetB], walls: [wall] },
    );
    expect(result.hit).toBe(false);
  });

  it("flags a headshot when the hit point is in the head region", () => {
    const result = raycast(
      { origin: vec3(0, 1.7, 0), dir: vec3(0, 0, 1) },
      { targets: [targetB] },
    );
    expect(result.hit).toBe(true);
    expect(result.isHead).toBe(true);
  });

  it("misses when the ray points away from the target", () => {
    const result = raycast(
      { origin: vec3(0, 1.0, 0), dir: vec3(0, 0, -1) },
      { targets: [targetB] },
    );
    expect(result.hit).toBe(false);
  });

  it("returns the nearest of two targets", () => {
    const near: CapsuleTarget = { id: "near", pos: vec3(0, 0, 3) };
    const result = raycast(
      { origin: vec3(0, 1.0, 0), dir: vec3(0, 0, 1) },
      { targets: [targetB, near] },
    );
    expect(result.targetId).toBe("near");
  });

  it("misses when the ray flies over the target's head (parallel slab)", () => {
    // dir.y = 0 and origin above the capsule top → rejected on the Y slab
    const result = raycast(
      { origin: vec3(0, 5, 0), dir: vec3(0, 0, 1) },
      { targets: [targetB] },
    );
    expect(result.hit).toBe(false);
  });

  it("misses when a diagonal ray passes beside the capsule", () => {
    // non-parallel on every axis, but exits the x-slab before the z-slab → tmin>tmax
    const result = raycast(
      { origin: vec3(0, 1, 0), dir: vec3(2, 0, 5) },
      { targets: [targetB] },
    );
    expect(result.hit).toBe(false);
  });

  it("hits with negative direction components", () => {
    const left: CapsuleTarget = { id: "L", pos: vec3(-5, 0, 5) };
    const result = raycast(
      { origin: vec3(0, 1, 0), dir: vec3(-5, 0, 5) },
      { targets: [left] },
    );
    expect(result.hit).toBe(true);
    expect(result.targetId).toBe("L");
  });

  it("respects maxDistance (target beyond range = no hit)", () => {
    const result = raycast(
      { origin: vec3(0, 1, 0), dir: vec3(0, 0, 1) },
      { targets: [targetB], maxDistance: 1 },
    );
    expect(result.hit).toBe(false);
  });
});
