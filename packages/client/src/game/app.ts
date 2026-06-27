/**
 * Browser game client: connects to the authoritative server, predicts the local
 * player, interpolates remotes, and renders first-person. Wires together the
 * already-tested net + render + input modules. Not unit-tested (DOM/WebGL); the
 * `vite build` is the smoke check, Playwright covers the live path.
 */
import { Client, type Room } from "colyseus.js";
import { TICK_RATE, PLAYER_EYE_HEIGHT, type InputCommand, type AABB } from "@cs/shared";
import { SceneManager } from "../render/scene.js";
import { Renderer } from "../render/renderer.js";
import { Controls } from "../input/controls.js";
import { Predictor } from "../net/prediction.js";
import { InterpolationBuffer } from "../net/interpolation.js";
import { keysToMoveVec } from "../input/mapping.js";
import { scoreboardFrom } from "./scoreboard.js";
import type { Team } from "../net/types.js";

interface Hud {
  status: HTMLElement;
  hp: HTMLElement;
  scoreboard: HTMLElement;
}

const noColliders = { colliders: [] as AABB[] };
const now = () => performance.now() / 1000;

export async function startGame(
  canvas: HTMLCanvasElement,
  hud: Hud,
  endpoint: string,
  mapId: string,
): Promise<void> {
  const client = new Client(endpoint);
  const room: Room = await client.joinOrCreate("game", { mapId });
  const localId = room.sessionId;

  const scene = new SceneManager();
  const renderer = new Renderer(canvas);
  const controls = new Controls(canvas);

  // Test hook: lets the E2E read who's connected and where they are.
  (globalThis as unknown as { __cs?: unknown }).__cs = {
    sessionId: localId,
    ids: () => {
      const out: string[] = [];
      room.state?.players?.forEach((_p: PlayerSchema, id: string) => out.push(id));
      return out;
    },
    player: (id: string) => {
      const p = room.state?.players?.get(id) as PlayerSchema | undefined;
      return p ? { x: p.x, y: p.y, z: p.z } : null;
    },
  };

  // Wait until our own player exists in state.
  await waitFor(() => room.state?.players?.get(localId) !== undefined);
  const me0 = room.state.players.get(localId);
  const predictor = new Predictor({ x: me0.x, y: me0.y, z: me0.z }, noColliders);

  const remotes = new Map<string, InterpolationBuffer>();
  let seq = 0;

  // Reconcile local + buffer remotes whenever the server patches state.
  room.onStateChange(() => {
    const present = new Set<string>();
    room.state.players.forEach((p: PlayerSchema, id: string) => {
      present.add(id);
      if (id === localId) {
        predictor.reconcile({
          pos: { x: p.x, y: p.y, z: p.z },
          lastProcessedSeq: p.lastProcessedSeq,
        });
        return;
      }
      if (!scene.getMesh(id)) scene.addPlayer(id, p.team as Team);
      let buf = remotes.get(id);
      if (!buf) remotes.set(id, (buf = new InterpolationBuffer()));
      buf.add({ t: now(), pos: { x: p.x, y: p.y, z: p.z } });
      scene.getMesh(id)!.rotation.y = p.yaw;
    });
    // drop players who left
    for (const id of [...remotes.keys()]) {
      if (!present.has(id)) {
        remotes.delete(id);
        scene.removePlayer(id);
      }
    }
    updateHud(hud, room, localId);
  });

  // Fixed-rate input: sample → send → predict locally.
  setInterval(() => {
    const cmd: InputCommand = {
      seq: ++seq,
      moveVec: keysToMoveVec(controls.keys),
      yaw: controls.yaw,
      pitch: controls.pitch,
      fire: controls.consumeFire(),
    };
    room.send("input", cmd);
    predictor.predict(cmd);
  }, 1000 / TICK_RATE);

  // Render at display refresh.
  const loop = () => {
    const t = now();
    for (const [id, buf] of remotes) {
      const p = buf.sample(t);
      if (p) scene.getMesh(id)?.position.set(p.x, p.y + PLAYER_EYE_HEIGHT / 2, p.z);
    }
    const eye = predictor.position;
    renderer.setView(
      { x: eye.x, y: eye.y + PLAYER_EYE_HEIGHT, z: eye.z },
      controls.yaw,
      controls.pitch,
    );
    renderer.render(scene.scene);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

interface PlayerSchema {
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: string;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  lastProcessedSeq: number;
}

function updateHud(hud: Hud, room: Room, localId: string): void {
  const s = room.state;
  const me = room.state.players.get(localId) as PlayerSchema | undefined;
  hud.status.textContent = `${s.mapId} · ${s.phase} · round ${s.roundNumber} — CT ${s.scoreCT} : ${s.scoreT} T`;
  hud.hp.textContent = me ? (me.alive ? `♥ ${me.hp}` : "DEAD") : "";

  const rows: Array<{ id: string; team: Team; kills: number; deaths: number; assists: number }> = [];
  room.state.players.forEach((p: PlayerSchema, id: string) =>
    rows.push({
      id: id === localId ? "you" : id.slice(0, 4),
      team: p.team as Team,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
    }),
  );
  hud.scoreboard.innerHTML = scoreboardFrom(rows)
    .map((r) => `${r.team} ${r.id} — ${r.kills}/${r.deaths}/${r.assists}`)
    .join("<br>");
}

function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (pred()) return resolve();
      if (performance.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 20);
    };
    tick();
  });
}
