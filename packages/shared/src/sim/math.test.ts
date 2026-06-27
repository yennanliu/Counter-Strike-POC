import { describe, it, expect } from "vitest";
import {
  vec3,
  add,
  sub,
  scale,
  length,
  normalize,
  clamp,
  forwardFromYawPitch,
} from "./math.js";

describe("vec3 math", () => {
  it("add / sub / scale component-wise", () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
    expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
    expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
  });

  it("length and normalize", () => {
    expect(length(vec3(3, 4, 0))).toBeCloseTo(5);
    const n = normalize(vec3(0, 0, 7));
    expect(n).toEqual(vec3(0, 0, 1));
    expect(length(n)).toBeCloseTo(1);
  });

  it("normalize of the zero vector is the zero vector (no NaN)", () => {
    expect(normalize(vec3(0, 0, 0))).toEqual(vec3(0, 0, 0));
  });

  it("clamp bounds below, above, and within", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("forwardFromYawPitch points +Z at yaw0/pitch0 and rotates with yaw", () => {
    const f0 = forwardFromYawPitch(0, 0);
    expect(f0.x).toBeCloseTo(0);
    expect(f0.y).toBeCloseTo(0);
    expect(f0.z).toBeCloseTo(1);

    const fRight = forwardFromYawPitch(Math.PI / 2, 0); // yaw 90° → +X
    expect(fRight.x).toBeCloseTo(1);
    expect(fRight.z).toBeCloseTo(0);

    const fUp = forwardFromYawPitch(0, Math.PI / 2); // pitch up → +Y
    expect(fUp.y).toBeCloseTo(1);
    expect(length(fUp)).toBeCloseTo(1);
  });
});
