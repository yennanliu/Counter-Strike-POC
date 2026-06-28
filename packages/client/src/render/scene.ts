/**
 * Three.js scene management — builds the world from a map manifest, tracks one
 * mesh (+ HP bar) per player, and owns transient effects (tracers, impacts,
 * damage popups). Scene-graph work only (no WebGLRenderer), so it's testable in
 * Node; DOM-dependent bits (canvas HP bars / damage text) are guarded so the
 * headless tests still run.
 */
import * as THREE from "three";
import { PLAYER_RADIUS, PLAYER_HEIGHT, type MapManifest, type Vec3 } from "@cs/shared";
import type { Team } from "../net/types.js";

const TEAM_COLOR: Record<Team, number> = { CT: 0x3b82f6, T: 0xef4444 };
const HAS_DOM = typeof document !== "undefined";

interface Effect {
  obj: THREE.Object3D;
  born: number;
  ttl: number;
  anim: (p: number) => void;
  dispose: () => void;
}

interface PlayerVisual {
  mesh: THREE.Mesh;
  bar?: { sprite: THREE.Sprite; draw: (hp: number) => void };
}

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

function makeHpBar(): PlayerVisual["bar"] {
  if (!HAS_DOM) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 10;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false }),
  );
  sprite.scale.set(1.4, 0.22, 1);
  const draw = (hp: number) => {
    const f = Math.max(0, Math.min(1, hp / 100));
    ctx.clearRect(0, 0, 64, 10);
    ctx.fillStyle = "#0008";
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = f > 0.5 ? "#39d353" : f > 0.25 ? "#e3b341" : "#f85149";
    ctx.fillRect(1, 1, 62 * f, 8);
    tex.needsUpdate = true;
  };
  draw(100);
  return { sprite, draw };
}

function makeTextSprite(text: string, color: string): THREE.Sprite | null {
  if (!HAS_DOM) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 44px monospace";
  ctx.fillStyle = color;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(text, 64, 32);
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(1.2, 0.6, 1);
  return sprite;
}

export class SceneManager {
  readonly scene = new THREE.Scene();
  private readonly players = new Map<string, PlayerVisual>();
  private readonly effects: Effect[] = [];

  constructor(map?: MapManifest) {
    const theme = map?.theme ?? {
      sky: 0x87ceeb,
      ground: 0x55694f,
      fog: 0x87ceeb,
      structure: 0xb0a890,
    };

    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, 40, 140);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(8, 18, 6);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(80, 40, theme.structure, theme.structure);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.02;
    this.scene.add(grid);

    if (map) {
      for (const c of map.colliders) this.scene.add(boxFromAABB(c.min, c.max, theme.structure));
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
    const bar = makeHpBar();
    if (bar) this.scene.add(bar.sprite);
    this.players.set(id, { mesh, bar });
    return mesh;
  }

  updatePlayer(id: string, pos: Vec3, yaw: number): void {
    const v = this.players.get(id);
    if (!v) return;
    v.mesh.position.set(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z);
    v.mesh.rotation.y = yaw;
    if (v.bar) v.bar.sprite.position.set(pos.x, pos.y + PLAYER_HEIGHT + 0.35, pos.z);
  }

  setHp(id: string, hp: number, alive: boolean): void {
    const v = this.players.get(id);
    if (!v) return;
    v.mesh.visible = alive;
    if (v.bar) {
      v.bar.sprite.visible = alive;
      v.bar.draw(hp);
    }
  }

  removePlayer(id: string): void {
    const v = this.players.get(id);
    if (!v) return;
    this.scene.remove(v.mesh);
    v.mesh.geometry.dispose();
    (v.mesh.material as THREE.Material).dispose();
    if (v.bar) {
      this.scene.remove(v.bar.sprite);
      v.bar.sprite.material.dispose();
    }
    this.players.delete(id);
  }

  getMesh(id: string): THREE.Mesh | undefined {
    return this.players.get(id)?.mesh;
  }

  playerCount(): number {
    return this.players.size;
  }

  // ── transient effects ──────────────────────────────────────────────────────

  tracer(from: Vec3, to: Vec3, nowMs: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({
      obj: line,
      born: nowMs,
      ttl: 90,
      anim: (p) => (mat.opacity = 1 - p),
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  impact(at: Vec3, killed: boolean, nowMs: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: killed ? 0xff3030 : 0xffd060,
      transparent: true,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat);
    sphere.position.set(at.x, at.y, at.z);
    this.scene.add(sphere);
    this.effects.push({
      obj: sphere,
      born: nowMs,
      ttl: 250,
      anim: (p) => {
        sphere.scale.setScalar(1 + p * 3);
        mat.opacity = 1 - p;
      },
      dispose: () => {
        sphere.geometry.dispose();
        mat.dispose();
      },
    });
  }

  damagePopup(at: Vec3, text: string, color: string, nowMs: number): void {
    const sprite = makeTextSprite(text, color);
    if (!sprite) return;
    sprite.position.set(at.x, at.y + 0.3, at.z);
    this.scene.add(sprite);
    this.effects.push({
      obj: sprite,
      born: nowMs,
      ttl: 700,
      anim: (p) => {
        sprite.position.y = at.y + 0.3 + p * 0.8;
        sprite.material.opacity = 1 - p;
      },
      dispose: () => sprite.material.dispose(),
    });
  }

  /** Advance + retire effects. Call once per rendered frame. */
  update(nowMs: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      const p = (nowMs - e.born) / e.ttl;
      if (p >= 1) {
        this.scene.remove(e.obj);
        e.dispose();
        this.effects.splice(i, 1);
      } else {
        e.anim(p);
      }
    }
  }
}
