/**
 * The single "advance one tick from one input" primitive shared by the server
 * (authority) and the client (prediction). Both call this so they can never
 * disagree about what an input does. Fixed dt = TICK_DT.
 */
import { stepMovement, type MovementContext } from "./movement.js";
import { TICK_DT } from "./constants.js";
import type { Vec3 } from "./math.js";

export interface InputCommand {
  /** Monotonic per-client sequence number; lets the server ack and the client reconcile. */
  seq: number;
  /** Local move intent: x = strafe, z = forward. */
  moveVec: { x: number; z: number };
  /** Facing yaw in radians. */
  yaw: number;
}

export function applyInput(
  pos: Vec3,
  cmd: InputCommand,
  ctx: MovementContext,
): Vec3 {
  return stepMovement(
    pos,
    { moveVec: cmd.moveVec, yaw: cmd.yaw, dt: TICK_DT },
    ctx,
  );
}
