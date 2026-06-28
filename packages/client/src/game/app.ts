/**
 * Browser game client: connects to the authoritative server, predicts the local
 * player, interpolates remotes, and renders first-person. Wires together the
 * already-tested net + render + input modules. Not unit-tested (DOM/WebGL); the
 * `vite build` is the smoke check, Playwright covers the live path.
 */
import { Client, type Room } from "colyseus.js";
import {
  TICK_RATE,
  PLAYER_EYE_HEIGHT,
  getMapManifest,
  WEAPONS,
  type InputCommand,
  type AABB,
} from "@cs/shared";

const WEAPON_NAME = (id: string): string =>
  (WEAPONS as Record<string, { name: string }>)[id]?.name ?? id;
import { SceneManager } from "../render/scene.js";
import { Renderer } from "../render/renderer.js";
import { Controls } from "../input/controls.js";
import { Predictor } from "../net/prediction.js";
import { InterpolationBuffer } from "../net/interpolation.js";
import { keysToMoveVec } from "../input/mapping.js";
import { scoreboardFrom } from "./scoreboard.js";
import type { Team, ShotEvent } from "../net/types.js";

interface Hud {
  status: HTMLElement;
  banner: HTMLElement;
  bombhud: HTMLElement;
  hp: HTMLElement;
  weapon: HTMLElement;
  scoreboard: HTMLElement;
  crosshair: HTMLElement;
  dmgflash: HTMLElement;
  dmgdir: HTMLElement;
}

export type Logger = (msg: string) => void;

/** Handle returned by startGame so the caller can leave back to the game center. */
export interface GameSession {
  leave: () => void;
}

const noColliders = { colliders: [] as AABB[] };
const now = () => performance.now() / 1000;

export async function startGame(
  canvas: HTMLCanvasElement,
  hud: Hud,
  endpoint: string,
  mapId: string,
  log: Logger = (m) => console.log("[cs]", m),
): Promise<GameSession> {
  log(`connecting to ${endpoint} · map=${mapId}`);
  const client = new Client(endpoint);

  let room: Room;
  try {
    room = await withTimeout(
      client.joinOrCreate("game", { mapId }),
      8000,
      `timed out after 8s waiting for ${endpoint} — is the server running? (pnpm --filter @cs/server dev)`,
    );
  } catch (err) {
    log(`✗ joinOrCreate failed: ${(err as Error).message || "(no message)"}`);
    throw err;
  }
  const localId = room.sessionId;
  log(`✓ joined room ${room.roomId} as ${localId}`);

  room.onError((code: number, message?: string) => log(`room error ${code}: ${message ?? ""}`));
  room.onLeave((code: number) => log(`left room (code ${code})`));

  const manifest = getMapManifest(room.state?.mapId ?? mapId) ?? getMapManifest(mapId);
  const scene = new SceneManager(manifest);
  const renderer = new Renderer(canvas);
  renderer.attachTo(scene.scene); // so the gun viewmodel renders
  const controls = new Controls(canvas);
  log(`renderer + input ready (map geometry: ${manifest ? manifest.colliders.length + " walls" : "none"})`);

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

  // NOTE: we're connected the moment joinOrCreate resolved — do NOT block on the
  // local player appearing in state (that stalls the "Connecting…" overlay). The
  // predictor is created lazily on the first state patch that includes us.
  let predictor: Predictor | null = null;
  const remotes = new Map<string, InterpolationBuffer>();
  const remoteYaw = new Map<string, number>();
  let seq = 0;
  let stateCount = 0;

  // Reconcile local + buffer remotes whenever the server patches state.
  room.onStateChange(() => {
    stateCount += 1;
    if (stateCount === 1) {
      log(`first state patch · players=${room.state?.players?.size ?? "?"}`);
    }
    const present = new Set<string>();
    room.state.players.forEach((p: PlayerSchema, id: string) => {
      present.add(id);
      if (id === localId) {
        if (!predictor) {
          predictor = new Predictor({ x: p.x, y: p.y, z: p.z }, noColliders);
          controls.yaw = Math.atan2(-p.x, -p.z); // face the map center on spawn
          log(`local player spawned at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) team=${p.team}`);
        }
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
      remoteYaw.set(id, p.yaw);
      scene.setHp(id, p.hp, p.alive);
    });
    for (const id of [...remotes.keys()]) {
      if (!present.has(id)) {
        remotes.delete(id);
        remoteYaw.delete(id);
        scene.removePlayer(id);
      }
    }
    updateHud(hud, room, localId);
    const st = room.state;
    scene.setBomb(st.bombPlanted, { x: st.bombX, y: st.bombY, z: st.bombZ });
  });

  // Trajectory + impact + damage feedback for every shot (authoritative).
  room.onMessage("shot", (e: ShotEvent) => {
    const t = performance.now();
    scene.tracer({ x: e.ox, y: e.oy, z: e.oz }, { x: e.ex, y: e.ey, z: e.ez }, t);
    if (!e.hit) return;
    const at = { x: e.ex, y: e.ey, z: e.ez };
    scene.impact(at, e.killed, t);
    scene.damagePopup(at, e.head ? `${e.dmg}!` : `${e.dmg}`, e.head ? "#ff5252" : "#ffd166", t);
    if (e.by === localId) {
      hud.crosshair.classList.add("hit");
      setTimeout(() => hud.crosshair.classList.remove("hit"), 120);
    }
    // A3: directional damage indicator when WE are the one hit.
    if (e.target === localId && predictor) {
      const me = predictor.position;
      const rel = Math.atan2(e.ox - me.x, e.oz - me.z) - controls.yaw;
      hud.dmgdir.style.transform = `rotate(${rel}rad)`;
      hud.dmgdir.style.opacity = "1";
      hud.dmgflash.style.opacity = "1";
      setTimeout(() => {
        hud.dmgdir.style.opacity = "0";
        hud.dmgflash.style.opacity = "0";
      }, 130);
    }
  });

  // Fixed-rate input: sample → send → predict locally (once we know our spawn).
  const inputTimer = setInterval(() => {
    const weaponSwitch = controls.consumeWeapon();
    if (weaponSwitch) room.send("weapon", weaponSwitch);

    const fired = controls.consumeFire(performance.now());
    const cmd: InputCommand = {
      seq: ++seq,
      moveVec: keysToMoveVec(controls.keys),
      yaw: controls.yaw,
      pitch: controls.pitch,
      fire: fired,
      use: controls.use,
    };
    room.send("input", cmd);
    predictor?.predict(cmd);
    if (fired) renderer.shoot();
  }, 1000 / TICK_RATE);

  // Render at display refresh.
  let raf = 0;
  const loop = () => {
    const t = now();
    for (const [id, buf] of remotes) {
      const p = buf.sample(t);
      if (p) scene.updatePlayer(id, p, remoteYaw.get(id) ?? 0);
    }
    scene.update(performance.now());
    const eye = predictor?.position ?? { x: 0, y: 0, z: 0 };
    renderer.setView(
      { x: eye.x, y: eye.y + PLAYER_EYE_HEIGHT, z: eye.z },
      controls.yaw,
      controls.pitch,
    );
    renderer.render(scene.scene);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  log("✓ in game (render loop running)");

  return {
    leave: () => {
      clearInterval(inputTimer);
      cancelAnimationFrame(raf);
      void room.leave();
      delete (globalThis as unknown as { __cs?: unknown }).__cs;
      log("left the match");
    },
  };
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
  weapon: string;
  lastProcessedSeq: number;
}

function updateHud(hud: Hud, room: Room, localId: string): void {
  const s = room.state;
  const me = room.state.players.get(localId) as PlayerSchema | undefined;
  hud.status.textContent = `${s.mapId} · ${s.phase} · round ${s.roundNumber} — CT ${s.scoreCT} : ${s.scoreT} T`;
  hud.hp.textContent = me ? (me.alive ? `♥ ${me.hp}` : "DEAD") : "";
  hud.weapon.textContent = me ? `▸ ${WEAPON_NAME(me.weapon)}   [1-9 switch]` : "";

  const banner: Record<string, string> = {
    freeze: "GET READY",
    ended: "ROUND OVER",
    matchOver: "MATCH OVER",
  };
  hud.banner.textContent = me && !me.alive && s.phase === "live" ? "ELIMINATED" : (banner[s.phase] ?? "");

  // Bomb status.
  if (s.bombActive) {
    if (s.bombPlanted) {
      const defuse = s.defuseProgress > 0 ? ` · DEFUSING ${Math.floor(s.defuseProgress * 100)}%` : "";
      hud.bombhud.textContent = `💣 BOMB DOWN — ${Math.ceil(s.bombTimeLeft)}s${defuse}`;
    } else if (s.plantProgress > 0) {
      hud.bombhud.textContent = `PLANTING… ${Math.floor(s.plantProgress * 100)}%`;
    } else {
      hud.bombhud.textContent = "";
    }
  } else {
    hud.bombhud.textContent = "";
  }

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

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
