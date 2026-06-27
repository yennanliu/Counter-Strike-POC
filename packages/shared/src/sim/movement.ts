/**
 * Deterministic player movement + collision.
 *
 * Pure function: `stepMovement(pos, input, ctx) -> newPos`. No mutation, no
 * `Date.now()`/`Math.random()`. The SAME function runs on the client (prediction)
 * and the server (authority), which is what keeps them in sync.
 *
 * Collision uses an axis-separated AABB sweep (move X, resolve; move Z, resolve).
 * The player is treated as an axis-aligned box of half-extent `radius` on X/Z and
 * full `height` on Y. This is the "simple AABB sweep" first cut from the plan; it
 * can be swapped for Rapier later behind the same signature.
 */
import { vec3, type Vec3 } from "./math.js";
import { PLAYER_SPEED, PLAYER_RADIUS, PLAYER_HEIGHT } from "./constants.js";

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface MovementInput {
  /** Local move intent: x = strafe (+right), z = forward (+forward). Magnitude clamped to 1. */
  moveVec: { x: number; z: number };
  /** Facing, radians, rotation about +Y. */
  yaw: number;
  /** Seconds advanced this step (usually TICK_DT). */
  dt: number;
}

export interface MovementContext {
  colliders: readonly AABB[];
  speed?: number;
  radius?: number;
  height?: number;
}

/** Does the player's vertical span overlap the collider on Y? */
function overlapsY(posY: number, h: number, c: AABB): boolean {
  return posY + h > c.min.y && posY < c.max.y;
}

/** Does an interval [center-r, center+r] overlap [lo, hi]? */
function overlaps1D(center: number, r: number, lo: number, hi: number): boolean {
  return center + r > lo && center - r < hi;
}

/**
 * Swept clamp along one axis. Given the old/new center coordinate and the player
 * half-extent, prevent the box from passing through `[lo, hi]` — even when a huge
 * step would overshoot it (no tunneling). Returns the resolved new coordinate.
 */
function sweepAxis(
  oldC: number,
  newC: number,
  r: number,
  lo: number,
  hi: number,
): number {
  if (newC > oldC) {
    // Moving +: leading edge mustn't cross the near face `lo`.
    if (newC + r > lo && oldC - r < hi) return Math.min(newC, lo - r);
  } else if (newC < oldC) {
    // Moving -: trailing edge mustn't cross the far face `hi`.
    if (newC - r < hi && oldC + r > lo) return Math.max(newC, hi + r);
  }
  return newC;
}

export function stepMovement(
  pos: Vec3,
  input: MovementInput,
  ctx: MovementContext,
): Vec3 {
  const speed = ctx.speed ?? PLAYER_SPEED;
  const r = ctx.radius ?? PLAYER_RADIUS;
  const h = ctx.height ?? PLAYER_HEIGHT;

  // Clamp move intent so diagonals aren't faster and oversized input can't speed-hack.
  let { x: strafe, z: forward } = input.moveVec;
  const mag = Math.hypot(strafe, forward);
  if (mag > 1) {
    strafe /= mag;
    forward /= mag;
  }

  // Rotate local intent into world space about +Y.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const dirX = sin * forward + cos * strafe;
  const dirZ = cos * forward - sin * strafe;

  const step = speed * input.dt;
  const next = vec3(pos.x, pos.y, pos.z);

  // ── X axis (other-axis overlap uses the still-old Z) ──
  let nx = pos.x + dirX * step;
  for (const c of ctx.colliders) {
    if (!overlapsY(next.y, h, c)) continue;
    if (!overlaps1D(pos.z, r, c.min.z, c.max.z)) continue;
    nx = sweepAxis(pos.x, nx, r, c.min.x, c.max.x);
  }
  next.x = nx;

  // ── Z axis (other-axis overlap uses the now-resolved X) ──
  let nz = pos.z + dirZ * step;
  for (const c of ctx.colliders) {
    if (!overlapsY(next.y, h, c)) continue;
    if (!overlaps1D(next.x, r, c.min.x, c.max.x)) continue;
    nz = sweepAxis(pos.z, nz, r, c.min.z, c.max.z);
  }
  next.z = nz;

  return next;
}
