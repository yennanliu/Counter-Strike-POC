/**
 * Three.js scene management — builds the world from a map manifest and tracks one
 * mesh per player. Pure scene-graph work (no WebGLRenderer), so it's testable in
 * Node; the WebGL renderer + render loop live in app.ts.
 */
import * as THREE from "three";
import { PLAYER_RADIUS, PLAYER_HEIGHT, type MapManifest, type Vec3 } from "@cs/shared";
import type { Team } from "../net/types.js";

const TEAM_COLOR: Record<Team, number> = { CT: 0x3b82f6, T: 0xef4444 };

function boxFromAABB(min: Vec3, max: Vec3, color: number): THREE.Mesh {
  const sx = max.x - min.x;
  const sy = max.y - min.y;
  const sz = max.z - min.z;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  mesh.position.set(min.x + sx / 2, min.y + sy / 2, min.z + sz / 2);
  return mesh;
}

export class SceneManager {
  readonly scene = new THREE.Scene();
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(map?: MapManifest) {
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 120);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(8, 18, 6);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x55694f, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Grid for spatial reference (lighter so the floor reads as a play area).
    const grid = new THREE.GridHelper(80, 40, 0xcfe0c0, 0x7e9272);
    grid.position.y = 0.02;
    this.scene.add(grid);

    if (map) {
      for (const c of map.colliders) this.scene.add(boxFromAABB(c.min, c.max, 0xb0a890));
      // flat spawn pads, colored by team, so you can orient
      for (const [team, pts] of [["CT", map.spawns.CT], ["T", map.spawns.T]] as const) {
        for (const s of pts) this.scene.add(this.spawnPad(s, TEAM_COLOR[team]));
      }
    }
  }

  private spawnPad(at: Vec3, color: number): THREE.Mesh {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.06, 16),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5 }),
    );
    pad.position.set(at.x, 0.03, at.z);
    return pad;
  }

  addPlayer(id: string, team: Team): THREE.Mesh {
    const bodyLen = Math.max(0.1, PLAYER_HEIGHT - 2 * PLAYER_RADIUS);
    const color = TEAM_COLOR[team];
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, bodyLen, 6, 12),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5 }),
    );
    this.scene.add(mesh);
    this.meshes.set(id, mesh);
    return mesh;
  }

  updatePlayer(id: string, pos: Vec3, yaw: number): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    mesh.position.set(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z);
    mesh.rotation.y = yaw;
  }

  removePlayer(id: string): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.meshes.delete(id);
  }

  getMesh(id: string): THREE.Mesh | undefined {
    return this.meshes.get(id);
  }

  playerCount(): number {
    return this.meshes.size;
  }
}
