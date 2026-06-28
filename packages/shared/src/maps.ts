/**
 * The 5 fields (requirement #6) as shared DATA, so the server builds
 * collision/spawns from them AND the browser client renders the same geometry.
 * Pure literals — no fs, no JSON import attributes — so they work in Node and the
 * browser bundle alike. Adding a field = add an entry here.
 *
 * Each field is an enclosed arena (perimeter walls), cover/corridors for sight-
 * line variety (C1/C2), and two bomb sites (A & B) for defusal mode (A5).
 */
import type { Vec3 } from "./sim/math.js";
import type { AABB } from "./sim/movement.js";

export interface MapTheme {
  sky: number;
  ground: number;
  fog: number;
  structure: number;
}

export interface BombSite {
  label: "A" | "B";
  area: AABB;
}

export interface MapManifest {
  id: string;
  version: number;
  name: string;
  bounds: { min: Vec3; max: Vec3 };
  spawns: { T: Vec3[]; CT: Vec3[] };
  /** Static world collision boxes (also rendered by the client). */
  colliders: AABB[];
  /** Plantable bomb sites (defusal mode). Absent/empty = elimination/timer mode. */
  bombSites?: BombSite[];
  theme?: MapTheme;
}

/** Cover/wall box from XZ footprint + height. */
const box = (minx: number, minz: number, maxx: number, maxz: number, h = 3): AABB => ({
  min: { x: minx, y: 0, z: minz },
  max: { x: maxx, y: h, z: maxz },
});

/** Four perimeter walls enclosing the bounds. */
const perimeter = (
  minx: number, minz: number, maxx: number, maxz: number, t = 1, h = 5,
): AABB[] => [
  box(minx, minz, maxx, minz + t, h),
  box(minx, maxz - t, maxx, maxz, h),
  box(minx, minz, minx + t, maxz, h),
  box(maxx - t, minz, maxx, maxz, h),
];

const site = (label: "A" | "B", x: number, z: number, r = 2): BombSite => ({
  label,
  area: { min: { x: x - r, y: 0, z: z - r }, max: { x: x + r, y: 0.3, z: z + r } },
});

export const ALL_MAPS: MapManifest[] = [
  {
    id: "arena",
    version: 1,
    name: "Arena",
    bounds: { min: { x: -14, y: 0, z: -14 }, max: { x: 14, y: 6, z: 14 } },
    spawns: {
      CT: [{ x: -11, y: 0, z: -11 }, { x: -11, y: 0, z: -8 }, { x: -8, y: 0, z: -11 }],
      T: [{ x: 11, y: 0, z: 11 }, { x: 11, y: 0, z: 8 }, { x: 8, y: 0, z: 11 }],
    },
    colliders: [
      ...perimeter(-14, -14, 14, 14),
      box(-2, -2, 2, 2, 3.5), // center pillar
      box(-9, 4, -5, 6, 2), // cover NW
      box(5, -6, 9, -4, 2), // cover SE
      box(-7, -1, -5, 7, 2.5), // wall (lane divider)
      box(5, -7, 7, 1, 2.5),
    ],
    bombSites: [site("A", -8, 8), site("B", 8, -8)],
    theme: { sky: 0x87ceeb, ground: 0x55694f, fog: 0x87ceeb, structure: 0xb0a890 },
  },
  {
    id: "dust-lite",
    version: 1,
    name: "Dust Lite",
    bounds: { min: { x: -18, y: 0, z: -18 }, max: { x: 18, y: 6, z: 18 } },
    spawns: {
      CT: [{ x: -14, y: 0, z: -14 }, { x: -14, y: 0, z: -11 }, { x: -11, y: 0, z: -14 }],
      T: [{ x: 14, y: 0, z: 14 }, { x: 14, y: 0, z: 11 }, { x: 11, y: 0, z: 14 }],
    },
    colliders: [
      ...perimeter(-18, -18, 18, 18),
      box(-4, -4, 4, 4, 3), // mid crates
      box(6, -10, 8, 10, 3), // long wall (A main)
      box(-8, 5, -6, 12, 3), // long wall (B)
      box(-3, 9, 1, 11, 2), // cover near A
      box(9, -3, 11, 1, 2), // cover near B
    ],
    bombSites: [site("A", -10, 10, 2.5), site("B", 10, -10, 2.5)],
    theme: { sky: 0xe6d3a3, ground: 0xc2a878, fog: 0xddc89a, structure: 0xa07f55 },
  },
  {
    id: "warehouse",
    version: 1,
    name: "Warehouse",
    bounds: { min: { x: -16, y: 0, z: -11 }, max: { x: 16, y: 5, z: 11 } },
    spawns: {
      CT: [{ x: -13, y: 0, z: -8 }, { x: -13, y: 0, z: 0 }, { x: -13, y: 0, z: 8 }],
      T: [{ x: 13, y: 0, z: 8 }, { x: 13, y: 0, z: 0 }, { x: 13, y: 0, z: -8 }],
    },
    colliders: [
      ...perimeter(-16, -11, 16, 11, 1, 4),
      box(-6, -3, -3, 0, 2), // stacked crates
      box(-6, 0, -3, 3, 3.5),
      box(3, -3, 6, 0, 3.5),
      box(3, 0, 6, 3, 2),
      box(-1, 5, 1, 8, 2.5), // central crate
      box(-1, -8, 1, -5, 2.5),
    ],
    bombSites: [site("A", -9, 6), site("B", 9, -6)],
    theme: { sky: 0x23262b, ground: 0x3b3f45, fog: 0x23262b, structure: 0x7a7f87 },
  },
  {
    id: "office",
    version: 1,
    name: "Office",
    bounds: { min: { x: -12, y: 0, z: -16 }, max: { x: 12, y: 4, z: 16 } },
    spawns: {
      CT: [{ x: -9, y: 0, z: -13 }, { x: -4, y: 0, z: -13 }, { x: 0, y: 0, z: -13 }],
      T: [{ x: 9, y: 0, z: 13 }, { x: 4, y: 0, z: 13 }, { x: 0, y: 0, z: 13 }],
    },
    colliders: [
      ...perimeter(-12, -16, 12, 16, 1, 3.5),
      box(-10, -3, -3, -1, 3), // office wall
      box(3, 1, 10, 3, 3), // office wall
      box(-2, -8, 2, -6, 2), // desk
      box(-2, 6, 2, 8, 2), // desk
      box(-1, -1, 1, 1, 1.5), // mid pillar
    ],
    bombSites: [site("A", -7, 9), site("B", 7, -9)],
    theme: { sky: 0x9fb3c8, ground: 0x4a5a6a, fog: 0xaebccd, structure: 0x8a93a0 },
  },
  {
    id: "bridge",
    version: 1,
    name: "Bridge",
    bounds: { min: { x: -8, y: 0, z: -22 }, max: { x: 8, y: 6, z: 22 } },
    spawns: {
      CT: [{ x: -4, y: 0, z: -18 }, { x: 0, y: 0, z: -18 }, { x: 4, y: 0, z: -18 }],
      T: [{ x: -4, y: 0, z: 18 }, { x: 0, y: 0, z: 18 }, { x: 4, y: 0, z: 18 }],
    },
    colliders: [
      ...perimeter(-8, -22, 8, 22),
      box(-2, -6, 2, -4, 2.5), // mid cover
      box(-2, 4, 2, 6, 2.5),
      box(-6, -1, -4, 1, 3), // side rails
      box(4, -1, 6, 1, 3),
      box(-1, -13, 1, -11, 1.5),
      box(-1, 11, 1, 13, 1.5),
    ],
    bombSites: [site("A", 0, 9), site("B", 0, -9)],
    theme: { sky: 0xb8c6d0, ground: 0x6b6e72, fog: 0xb8c6d0, structure: 0x9aa0a6 },
  },
];

export function getMapManifest(id: string): MapManifest | undefined {
  return ALL_MAPS.find((m) => m.id === id);
}
