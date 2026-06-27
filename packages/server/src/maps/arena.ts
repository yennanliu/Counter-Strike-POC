/**
 * Temporary default field used until P4 introduces the MapRegistry + 5 real maps.
 * Five spawns (enough for the 5-player cap) around a central pillar collider.
 */
import { vec3 } from "@cs/shared";
import type { Arena } from "../sim/GameSimulation.js";

export const DEFAULT_ARENA: Arena = {
  spawns: [
    vec3(-6, 0, -6),
    vec3(6, 0, 6),
    vec3(-6, 0, 6),
    vec3(6, 0, -6),
    vec3(0, 0, -8),
  ],
  colliders: [
    // central pillar
    { min: vec3(-1, 0, -1), max: vec3(1, 3, 1) },
  ],
};
