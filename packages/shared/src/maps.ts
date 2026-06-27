/**
 * The 5 fields (requirement #6) as shared DATA, so the server builds
 * collision/spawns from them AND the browser client renders the same geometry.
 * Pure literals — no fs, no JSON import attributes — so they work in Node and the
 * browser bundle alike. Adding a field = add an entry here.
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
  /** Static world collision boxes (also rendered by the client). */
  colliders: AABB[];
}

const box = (
  minx: number, minz: number, maxx: number, maxz: number, h = 3,
): AABB => ({ min: { x: minx, y: 0, z: minz }, max: { x: maxx, y: h, z: maxz } });

export const ALL_MAPS: MapManifest[] = [
  {
    id: "arena",
    version: 1,
    name: "Arena",
    bounds: { min: { x: -12, y: 0, z: -12 }, max: { x: 12, y: 6, z: 12 } },
    spawns: {
      CT: [{ x: -8, y: 0, z: -8 }, { x: -8, y: 0, z: -4 }, { x: -8, y: 0, z: 0 }],
      T: [{ x: 8, y: 0, z: 8 }, { x: 8, y: 0, z: 4 }, { x: 8, y: 0, z: 0 }],
    },
    colliders: [box(-1, -1, 1, 1), box(-6, 5, -4, 7, 2), box(4, -7, 6, -5, 2)],
  },
  {
    id: "dust-lite",
    version: 1,
    name: "Dust Lite",
    bounds: { min: { x: -16, y: 0, z: -16 }, max: { x: 16, y: 6, z: 16 } },
    spawns: {
      CT: [{ x: -12, y: 0, z: -12 }, { x: -12, y: 0, z: -8 }, { x: -10, y: 0, z: -12 }],
      T: [{ x: 12, y: 0, z: 12 }, { x: 12, y: 0, z: 8 }, { x: 10, y: 0, z: 12 }],
    },
    colliders: [box(-3, -3, 3, 3), box(5, -8, 7, 8, 2), box(-8, 4, -5, 6, 2)],
  },
  {
    id: "warehouse",
    version: 1,
    name: "Warehouse",
    bounds: { min: { x: -14, y: 0, z: -10 }, max: { x: 14, y: 5, z: 10 } },
    spawns: {
      CT: [{ x: -11, y: 0, z: -7 }, { x: -11, y: 0, z: 0 }, { x: -11, y: 0, z: 7 }],
      T: [{ x: 11, y: 0, z: 7 }, { x: 11, y: 0, z: 0 }, { x: 11, y: 0, z: -7 }],
    },
    colliders: [box(-4, -2, -2, 2, 2), box(2, -2, 4, 2, 2), box(-1, 4, 1, 6)],
  },
  {
    id: "office",
    version: 1,
    name: "Office",
    bounds: { min: { x: -10, y: 0, z: -14 }, max: { x: 10, y: 4, z: 14 } },
    spawns: {
      CT: [{ x: -7, y: 0, z: -11 }, { x: -3, y: 0, z: -11 }, { x: 0, y: 0, z: -11 }],
      T: [{ x: 7, y: 0, z: 11 }, { x: 3, y: 0, z: 11 }, { x: 0, y: 0, z: 11 }],
    },
    colliders: [box(-8, -2, -3, 0), box(3, 0, 8, 2)],
  },
  {
    id: "bridge",
    version: 1,
    name: "Bridge",
    bounds: { min: { x: -6, y: 0, z: -20 }, max: { x: 6, y: 6, z: 20 } },
    spawns: {
      CT: [{ x: -3, y: 0, z: -16 }, { x: 0, y: 0, z: -16 }, { x: 3, y: 0, z: -16 }],
      T: [{ x: -3, y: 0, z: 16 }, { x: 0, y: 0, z: 16 }, { x: 3, y: 0, z: 16 }],
    },
    colliders: [box(-1, -4, 1, -2, 2), box(-1, 2, 1, 4, 2)],
  },
];

export function getMapManifest(id: string): MapManifest | undefined {
  return ALL_MAPS.find((m) => m.id === id);
}
