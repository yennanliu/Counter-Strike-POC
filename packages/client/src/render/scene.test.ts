import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { SceneManager } from "./scene.js";
import type { MapManifest } from "@cs/shared";

const map: MapManifest = {
  id: "test",
  version: 1,
  name: "Test",
  bounds: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 3, z: 5 } },
  spawns: { T: [{ x: 1, y: 0, z: 1 }], CT: [{ x: -1, y: 0, z: -1 }] },
  colliders: [{ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } }],
};

describe("SceneManager — render scene graph (headless, no WebGL)", () => {
  it("builds a scene with lights/ground and one mesh per collider", () => {
    const sm = new SceneManager(map);
    const meshes = sm.scene.children.filter((o) => o instanceof THREE.Mesh);
    // ground + 1 collider box
    expect(meshes.length).toBeGreaterThanOrEqual(2);
    expect(sm.scene.children.some((o) => o instanceof THREE.Light)).toBe(true);
  });

  it("adds, updates, and removes player meshes", () => {
    const sm = new SceneManager();
    expect(sm.playerCount()).toBe(0);

    sm.addPlayer("a", "CT");
    sm.addPlayer("b", "T");
    expect(sm.playerCount()).toBe(2);
    expect(sm.getMesh("a")).toBeDefined();

    sm.updatePlayer("a", { x: 3, y: 0, z: -2 }, 1.2);
    const mesh = sm.getMesh("a")!;
    expect(mesh.position.x).toBeCloseTo(3);
    expect(mesh.position.z).toBeCloseTo(-2);
    expect(mesh.rotation.y).toBeCloseTo(1.2);

    sm.removePlayer("a");
    expect(sm.playerCount()).toBe(1);
    expect(sm.getMesh("a")).toBeUndefined();
    expect(sm.scene.children).not.toContain(mesh);
  });

  it("colors players by team", () => {
    const sm = new SceneManager();
    const ct = sm.addPlayer("a", "CT");
    const t = sm.addPlayer("b", "T");
    const ctColor = (ct.material as THREE.MeshStandardMaterial).color.getHex();
    const tColor = (t.material as THREE.MeshStandardMaterial).color.getHex();
    expect(ctColor).not.toBe(tColor);
  });
});
