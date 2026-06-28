/** Minimal, allocation-light 3D vector math for the deterministic sim. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const scale = (a: Vec3, s: number): Vec3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});

export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len === 0 ? vec3(0, 0, 0) : scale(a, 1 / len);
};

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Clamp a number into [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/**
 * Perturb a unit direction by a random offset inside a cone of half-angle
 * `angle` (radians), drawing from `rng` (so it's deterministic). angle<=0 returns
 * `dir` unchanged — used for first-shot accuracy.
 */
export const perturbDirection = (
  dir: Vec3,
  angle: number,
  rng: () => number,
): Vec3 => {
  if (angle <= 0) return dir;
  const r = Math.tan(angle * Math.sqrt(rng()));
  const theta = rng() * Math.PI * 2;
  const up: Vec3 = Math.abs(dir.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(dir, up));
  const upv = cross(right, dir);
  const offset = add(scale(right, r * Math.cos(theta)), scale(upv, r * Math.sin(theta)));
  return normalize(add(dir, offset));
};

/**
 * Unit forward direction from a yaw (about +Y) and pitch (up positive). Matches
 * the movement yaw convention: at yaw=0, pitch=0 the forward is +Z. Used for
 * aiming/hitscan so the shooting ray agrees with how the player faces.
 */
export const forwardFromYawPitch = (yaw: number, pitch: number): Vec3 => ({
  x: Math.cos(pitch) * Math.sin(yaw),
  y: Math.sin(pitch),
  z: Math.cos(pitch) * Math.cos(yaw),
});
