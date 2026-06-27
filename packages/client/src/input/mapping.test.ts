import { describe, it, expect } from "vitest";
import {
  keysToMoveVec,
  keyToAction,
  applyMouseDelta,
  PITCH_LIMIT,
  type KeyState,
} from "./mapping.js";

const keys = (over: Partial<KeyState> = {}): KeyState => ({
  forward: false,
  back: false,
  left: false,
  right: false,
  ...over,
});

describe("input mapping — T-080: keys/mouse → move/aim", () => {
  it("maps WASD to a local move vector (x=strafe, z=forward)", () => {
    expect(keysToMoveVec(keys({ forward: true }))).toEqual({ x: 0, z: 1 });
    expect(keysToMoveVec(keys({ back: true }))).toEqual({ x: 0, z: -1 });
    expect(keysToMoveVec(keys({ right: true }))).toEqual({ x: 1, z: 0 });
    expect(keysToMoveVec(keys({ left: true }))).toEqual({ x: -1, z: 0 });
    expect(keysToMoveVec(keys({ forward: true, right: true }))).toEqual({ x: 1, z: 1 });
  });

  it("cancels opposing keys", () => {
    expect(keysToMoveVec(keys({ forward: true, back: true }))).toEqual({ x: 0, z: 0 });
    expect(keysToMoveVec(keys({ left: true, right: true }))).toEqual({ x: 0, z: 0 });
  });

  it("maps physical key codes (WASD + arrows) to actions", () => {
    expect(keyToAction("KeyW")).toBe("forward");
    expect(keyToAction("ArrowUp")).toBe("forward");
    expect(keyToAction("KeyA")).toBe("left");
    expect(keyToAction("KeyS")).toBe("back");
    expect(keyToAction("KeyD")).toBe("right");
    expect(keyToAction("Space")).toBeNull();
  });

  it("applies mouse delta: dx turns yaw, dy pitches (inverted)", () => {
    const r = applyMouseDelta(0, 0, 100, 0);
    expect(r.yaw).toBeGreaterThan(0);
    expect(r.pitch).toBe(0);

    const down = applyMouseDelta(0, 0, 0, 100); // mouse down → look down (pitch < 0)
    expect(down.pitch).toBeLessThan(0);
  });

  it("clamps pitch to ±PITCH_LIMIT", () => {
    expect(applyMouseDelta(0, 0, 0, -100000).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(applyMouseDelta(0, 0, 0, 100000).pitch).toBeCloseTo(-PITCH_LIMIT);
  });
});
