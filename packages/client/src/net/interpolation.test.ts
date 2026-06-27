import { describe, it, expect } from "vitest";
import { InterpolationBuffer } from "./interpolation.js";
import { vec3 } from "@cs/shared";

describe("InterpolationBuffer — T-041: render remote entities in the past", () => {
  const DELAY = 0.1; // render 100ms behind

  it("linearly interpolates between two snapshots at render time", () => {
    const buf = new InterpolationBuffer(DELAY);
    buf.add({ t: 0, pos: vec3(0, 0, 0) });
    buf.add({ t: 1, pos: vec3(0, 0, 10) });

    // now=0.6 → renderTime = 0.5 → halfway between the two snapshots
    const at = buf.sample(0.6);
    expect(at).not.toBeNull();
    expect(at!.z).toBeCloseTo(5);
  });

  it("clamps to the earliest snapshot before the buffer starts", () => {
    const buf = new InterpolationBuffer(DELAY);
    buf.add({ t: 0, pos: vec3(0, 0, 0) });
    buf.add({ t: 1, pos: vec3(0, 0, 10) });
    // now=0.05 → renderTime = -0.05, before the first snapshot
    expect(buf.sample(0.05)!.z).toBeCloseTo(0);
  });

  it("clamps to the latest snapshot past the buffer end", () => {
    const buf = new InterpolationBuffer(DELAY);
    buf.add({ t: 0, pos: vec3(0, 0, 0) });
    buf.add({ t: 1, pos: vec3(0, 0, 10) });
    // now=5 → renderTime = 4.9, past the last snapshot
    expect(buf.sample(5)!.z).toBeCloseTo(10);
  });

  it("returns null when the buffer is empty", () => {
    expect(new InterpolationBuffer(DELAY).sample(1)).toBeNull();
  });

  it("handles out-of-order inserts and three snapshots", () => {
    const buf = new InterpolationBuffer(DELAY);
    buf.add({ t: 2, pos: vec3(0, 0, 20) });
    buf.add({ t: 0, pos: vec3(0, 0, 0) });
    buf.add({ t: 1, pos: vec3(0, 0, 10) });
    // now=1.6 → renderTime=1.5 → halfway between t=1 (z10) and t=2 (z20)
    expect(buf.sample(1.6)!.z).toBeCloseTo(15);
  });
});
