/**
 * Deterministic hitscan resolution.
 *
 * A ray is tested against player capsules (approximated as vertical AABBs) and
 * world walls. The NEAREST surface wins: if a wall is closer than the target, the
 * shot is blocked and reports no hit. Pure function, no mutation/RNG/time.
 */
import { normalize, add, scale, type Vec3 } from "./math.js";
import type { AABB } from "./movement.js";
import {
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  HEADSHOT_HEIGHT_FRAC,
} from "./constants.js";

export interface Ray {
  origin: Vec3;
  /** Direction; need not be normalized. */
  dir: Vec3;
}

export interface CapsuleTarget {
  id: string;
  /** Feet position; the capsule rises `PLAYER_HEIGHT` from here. */
  pos: Vec3;
}

export interface HitscanContext {
  targets: readonly CapsuleTarget[];
  walls?: readonly AABB[];
  maxDistance?: number;
}

export interface HitResult {
  hit: boolean;
  targetId?: string;
  distance?: number;
  point?: Vec3;
  isHead?: boolean;
}

/**
 * Ray vs AABB (slab method). Returns the forward entry distance `t >= 0`, or null
 * if the ray (in its forward direction) never enters the box. `dir` must be
 * normalized so `t` is a real distance.
 */
function rayAABB(origin: Vec3, dir: Vec3, box: AABB): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;

  const axes: Array<["x" | "y" | "z"]> = [["x"], ["y"], ["z"]];
  for (const [a] of axes) {
    const o = origin[a];
    const d = dir[a];
    const lo = box.min[a];
    const hi = box.max[a];
    if (d === 0) {
      // Parallel to the slab: miss if origin is outside it.
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }

  if (tmax < 0) return null; // box is entirely behind the ray
  return tmin >= 0 ? tmin : 0; // 0 => origin already inside the box
}

function capsuleAABB(t: CapsuleTarget): AABB {
  return {
    min: { x: t.pos.x - PLAYER_RADIUS, y: t.pos.y, z: t.pos.z - PLAYER_RADIUS },
    max: {
      x: t.pos.x + PLAYER_RADIUS,
      y: t.pos.y + PLAYER_HEIGHT,
      z: t.pos.z + PLAYER_RADIUS,
    },
  };
}

export function raycast(ray: Ray, ctx: HitscanContext): HitResult {
  const dir = normalize(ray.dir);
  const maxDist = ctx.maxDistance ?? Infinity;

  // Nearest blocking wall.
  let nearestWall = Infinity;
  for (const w of ctx.walls ?? []) {
    const t = rayAABB(ray.origin, dir, w);
    if (t !== null && t < nearestWall) nearestWall = t;
  }

  // Nearest target.
  let best: { target: CapsuleTarget; t: number } | null = null;
  for (const target of ctx.targets) {
    const t = rayAABB(ray.origin, dir, capsuleAABB(target));
    if (t === null) continue;
    if (best === null || t < best.t) best = { target, t };
  }

  if (best === null) return { hit: false };
  if (best.t > maxDist) return { hit: false };
  if (best.t >= nearestWall) return { hit: false }; // a wall is in the way

  const point = add(ray.origin, scale(dir, best.t));
  const headThreshold = best.target.pos.y + PLAYER_HEIGHT * HEADSHOT_HEIGHT_FRAC;
  return {
    hit: true,
    targetId: best.target.id,
    distance: best.t,
    point,
    isHead: point.y >= headThreshold,
  };
}
