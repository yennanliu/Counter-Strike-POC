/**
 * A "field" (playground) is pure data — a manifest, not code (requirement #6).
 * This shape is shared so the server builds collision/spawns from it and the
 * client (P6) and replay viewer can load the exact same geometry.
 */
import type { Vec3 } from "./sim/math.js";
import type { AABB } from "./sim/movement.js";

export interface MapManifest {
  id: string;
  version: number;
  name: string;
  /** World bounds (informational / future out-of-bounds checks). */
  bounds: { min: Vec3; max: Vec3 };
  /** Team spawn points. */
  spawns: { T: Vec3[]; CT: Vec3[] };
  /** Static world collision boxes. */
  colliders: AABB[];
}
