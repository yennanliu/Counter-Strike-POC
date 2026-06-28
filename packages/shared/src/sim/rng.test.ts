import { describe, it, expect } from "vitest";
import { mulberry32 } from "./rng.js";
import { perturbDirection, length, vec3 } from "./math.js";

describe("mulberry32 — deterministic PRNG", () => {
  it("same seed → same sequence; values in [0,1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 5; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds → different sequences", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("perturbDirection — weapon spread", () => {
  it("returns the same direction when angle is 0 (first-shot accuracy)", () => {
    const dir = vec3(0, 0, 1);
    expect(perturbDirection(dir, 0, mulberry32(1))).toEqual(dir);
  });

  it("stays a unit vector and within the cone for angle > 0", () => {
    const dir = vec3(0, 0, 1);
    const out = perturbDirection(dir, 0.1, mulberry32(7));
    expect(length(out)).toBeCloseTo(1);
    // dot with original ≈ cos(offset) ≥ cos(0.1)
    const dot = out.x * dir.x + out.y * dir.y + out.z * dir.z;
    expect(dot).toBeGreaterThan(Math.cos(0.12));
  });

  it("is deterministic for the same seed", () => {
    expect(perturbDirection(vec3(0, 0, 1), 0.1, mulberry32(9))).toEqual(
      perturbDirection(vec3(0, 0, 1), 0.1, mulberry32(9)),
    );
  });
});
