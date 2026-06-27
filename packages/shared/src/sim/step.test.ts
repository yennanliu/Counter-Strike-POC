import { describe, it, expect } from "vitest";
import { applyInput, type InputCommand } from "./step.js";
import { stepMovement, type AABB } from "./movement.js";
import { vec3 } from "./math.js";
import { PLAYER_SPEED, TICK_DT } from "./constants.js";

const noColliders = { colliders: [] as AABB[] };

describe("applyInput — fixed-step authoritative/predicted advance", () => {
  it("advances one TICK_DT step, equivalent to stepMovement at dt=TICK_DT", () => {
    const cmd: InputCommand = { seq: 1, moveVec: { x: 0, z: 1 }, yaw: 0 };
    const viaApply = applyInput(vec3(0, 0, 0), cmd, noColliders);
    const viaMovement = stepMovement(
      vec3(0, 0, 0),
      { moveVec: { x: 0, z: 1 }, yaw: 0, dt: TICK_DT },
      noColliders,
    );
    expect(viaApply).toEqual(viaMovement);
    expect(viaApply.z).toBeCloseTo(PLAYER_SPEED * TICK_DT);
  });

  it("is deterministic for the same command and context", () => {
    const cmd: InputCommand = { seq: 7, moveVec: { x: 0.5, z: 1 }, yaw: 1.2 };
    expect(applyInput(vec3(1, 0, 2), cmd, noColliders)).toEqual(
      applyInput(vec3(1, 0, 2), cmd, noColliders),
    );
  });
});
