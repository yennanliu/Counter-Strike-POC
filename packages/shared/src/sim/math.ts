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

/** Clamp a number into [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;
