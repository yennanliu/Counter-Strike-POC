import { describe, it, expect } from "vitest";
import { vec3, add, sub, scale, length, normalize, clamp } from "./math.js";

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
});
