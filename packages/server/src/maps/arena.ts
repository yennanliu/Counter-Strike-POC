/**
 * Fallback arena used when no map is specified. P4's MapRegistry provides the 5
 * real fields; this stays as a safe default. Team spawns on opposite corners
 * around a central pillar.
 */
import { vec3 } from "@cs/shared";
import type { Arena } from "../sim/GameSimulation.js";

export const DEFAULT_ARENA: Arena = {
  spawnsCT: [vec3(-6, 0, -6), vec3(-6, 0, 6), vec3(-8, 0, 0)],
  spawnsT: [vec3(6, 0, 6), vec3(6, 0, -6), vec3(8, 0, 0)],
  colliders: [
    // central pillar
    { min: vec3(-1, 0, -1), max: vec3(1, 3, 1) },
  ],
};
