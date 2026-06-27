/**
 * Loads and validates the field manifests (requirement #6 — "5 different
 * fields"). Maps are shared DATA (`@cs/shared` ALL_MAPS) so the server and the
 * browser client render the exact same geometry. Adding a field = add an entry to
 * shared/maps.ts.
 */
import { ALL_MAPS, type MapManifest, type Vec3 } from "@cs/shared";
import type { Arena } from "../sim/GameSimulation.js";

function isVec3(v: unknown): v is Vec3 {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Vec3).x === "number" &&
    typeof (v as Vec3).y === "number" &&
    typeof (v as Vec3).z === "number"
  );
}

function isAABB(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    isVec3((v as { min: unknown }).min) &&
    isVec3((v as { max: unknown }).max)
  );
}

/** Validate an unknown value as a MapManifest, throwing a descriptive error. */
export function validateManifest(input: unknown): MapManifest {
  const fail = (msg: string): never => {
    throw new Error(`invalid map manifest: ${msg}`);
  };
  if (typeof input !== "object" || input === null) return fail("not an object");
  const o = input as Record<string, unknown>;

  if (typeof o.id !== "string" || o.id.length === 0) return fail("missing id");
  if (typeof o.name !== "string" || o.name.length === 0) return fail(`${o.id}: missing name`);
  if (typeof o.version !== "number") return fail(`${o.id}: missing version`);

  const bounds = o.bounds as { min?: unknown; max?: unknown } | undefined;
  if (!bounds || !isVec3(bounds.min) || !isVec3(bounds.max)) return fail(`${String(o.id)}: bad bounds`);

  const spawns = o.spawns as { T?: unknown; CT?: unknown } | undefined;
  if (!spawns || !Array.isArray(spawns.T) || !Array.isArray(spawns.CT)) {
    return fail(`${String(o.id)}: bad spawns`);
  }
  if (spawns.T.length === 0 || spawns.CT.length === 0) {
    return fail(`${String(o.id)}: need at least one T and one CT spawn`);
  }
  if (!spawns.T.every(isVec3) || !spawns.CT.every(isVec3)) {
    return fail(`${String(o.id)}: spawn is not a Vec3`);
  }

  if (!Array.isArray(o.colliders) || !o.colliders.every(isAABB)) {
    return fail(`${String(o.id)}: bad colliders`);
  }

  return input as MapManifest;
}

export class MapRegistry {
  private readonly maps = new Map<string, MapManifest>();

  constructor() {
    for (const raw of ALL_MAPS) {
      const manifest = validateManifest(raw);
      this.maps.set(manifest.id, manifest);
    }
  }

  get(id: string): MapManifest | undefined {
    return this.maps.get(id);
  }

  has(id: string): boolean {
    return this.maps.has(id);
  }

  list(): MapManifest[] {
    return [...this.maps.values()];
  }
}

/** Build the collision/spawn Arena the simulation consumes from a manifest. */
export function arenaFromManifest(m: MapManifest): Arena {
  return {
    spawnsT: m.spawns.T,
    spawnsCT: m.spawns.CT,
    colliders: m.colliders,
  };
}
