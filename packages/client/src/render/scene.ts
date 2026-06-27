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
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.set(min.x + sx / 2, min.y + sy / 2, min.z + sz / 2);
  return mesh;
}

export class SceneManager {
  readonly scene = new THREE.Scene();
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(map?: MapManifest) {
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(5, 10, 5);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x2e3b2e }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    if (map) {
      for (const c of map.colliders) this.scene.add(boxFromAABB(c.min, c.max, 0x9aa0a6));
    }
  }

  addPlayer(id: string, team: Team): THREE.Mesh {
    const bodyLen = Math.max(0.1, PLAYER_HEIGHT - 2 * PLAYER_RADIUS);
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, bodyLen, 4, 8),
      new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team] }),
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
