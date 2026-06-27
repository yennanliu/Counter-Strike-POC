import { describe, it, expect } from "vitest";
import { Predictor } from "./prediction.js";
import {
  vec3,
  applyInput,
  PLAYER_SPEED,
  TICK_DT,
  type InputCommand,
  type AABB,
} from "@cs/shared";

const noColliders = { colliders: [] as AABB[] };
const fwd = (seq: number): InputCommand => ({ seq, moveVec: { x: 0, z: 1 }, yaw: 0 });

describe("Predictor — T-040: client-side prediction", () => {
  it("applies local input immediately, matching the shared sim", () => {
    const p = new Predictor(vec3(0, 0, 0), noColliders);
    const after = p.predict(fwd(1));
    expect(after.z).toBeCloseTo(PLAYER_SPEED * TICK_DT);
    expect(p.position.z).toBeCloseTo(PLAYER_SPEED * TICK_DT);
  });

  it("reconciles: drops acked inputs and replays the rest onto the server position", () => {
    const p = new Predictor(vec3(0, 0, 0), noColliders);
    p.predict(fwd(1));
    p.predict(fwd(2));
    p.predict(fwd(3));

    // Server has authoritatively processed up to seq 2 (computed the same way).
    let serverPos = vec3(0, 0, 0);
    serverPos = applyInput(serverPos, fwd(1), noColliders);
    serverPos = applyInput(serverPos, fwd(2), noColliders);

    const reconciled = p.reconcile({ pos: serverPos, lastProcessedSeq: 2 });

    // Equivalent to 3 clean steps — prediction stayed consistent after replay.
    let pure = vec3(0, 0, 0);
    for (const s of [1, 2, 3]) pure = applyInput(pure, fwd(s), noColliders);
    expect(reconciled.z).toBeCloseTo(pure.z);
  });

  it("corrects a wrong prediction toward the authoritative server value", () => {
    // Client predicts with NO knowledge of a wall, so it over-predicts forward.
    const p = new Predictor(vec3(0, 0, 0), noColliders);
    p.predict(fwd(1));
    const optimistic = p.position.z;

    // Server clamped the move (e.g. a wall) to a smaller z and acked seq 1.
    const serverPos = vec3(0, 0, 0.05);
    const corrected = p.reconcile({ pos: serverPos, lastProcessedSeq: 1 });

    expect(corrected.z).toBeCloseTo(0.05);
    expect(corrected.z).toBeLessThan(optimistic);
  });
});
