/**
 * The 5 fields (requirement #6) as shared DATA, so the server builds
 * collision/spawns from them AND the browser client renders the same geometry.
 * Pure literals — no fs, no JSON import attributes — so they work in Node and the
 * browser bundle alike. Adding a field = add an entry here.
 */
import type { Vec3 } from "./sim/math.js";
import type { AABB } from "./sim/movement.js";

/** Visual palette so each field looks distinct (client rendering only). */
export interface MapTheme {
  sky: number;
  ground: number;
  fog: number;
  structure: number;
}

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
  /** Optional visual theme; the client falls back to a default if absent. */
  theme?: MapTheme;
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
    theme: { sky: 0x87ceeb, ground: 0x55694f, fog: 0x87ceeb, structure: 0xb0a890 },
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
    theme: { sky: 0xe6d3a3, ground: 0xc2a878, fog: 0xddc89a, structure: 0xa07f55 },
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
    theme: { sky: 0x23262b, ground: 0x3b3f45, fog: 0x23262b, structure: 0x7a7f87 },
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
    theme: { sky: 0x9fb3c8, ground: 0x4a5a6a, fog: 0xaebccd, structure: 0x8a93a0 },
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
    theme: { sky: 0xb8c6d0, ground: 0x6b6e72, fog: 0xb8c6d0, structure: 0x9aa0a6 },
  },
];

export function getMapManifest(id: string): MapManifest | undefined {
  return ALL_MAPS.find((m) => m.id === id);
}
