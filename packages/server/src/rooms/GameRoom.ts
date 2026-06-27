/**
 * Colyseus room: the network adapter around the authoritative GameSimulation and
 * the RoundManager. It owns no game logic — it builds the field from the chosen
 * map, translates joins/leaves/inputs into sim calls, drives the round FSM on a
 * fixed tick, and mirrors sim + round state into the synced Schema.
 */
import { Room, type Client } from "@colyseus/core";
import type { InputCommand } from "@cs/shared";
import { TICK_RATE, MAX_PLAYERS } from "@cs/shared";
import { GameState, PlayerState } from "../state/schema.js";
import { GameSimulation } from "../sim/GameSimulation.js";
import { RoundManager } from "../round/RoundManager.js";
import { MapRegistry, arenaFromManifest } from "../maps/MapRegistry.js";
import { DEFAULT_ARENA } from "../maps/arena.js";
import { ReplayRecorder, serializeRecording } from "../recording/recorder.js";
import type { MatchStore, MatchSummary } from "../persistence/db.js";
import type { ReplayStore } from "../persistence/replayStore.js";

// One registry for the process — reads the map files once.
const mapRegistry = new MapRegistry();

/** Process-wide persistence, configured from env in main.ts. Null = disabled. */
export interface RoomPersistence {
  db: MatchStore;
  replays: ReplayStore | null;
}
let persistence: RoomPersistence | null = null;
export function configurePersistence(p: RoomPersistence | null): void {
  persistence = p;
}

export interface GameRoomOptions {
  mapId?: string;
  mode?: string;
}

export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS;
  private sim!: GameSimulation;
  private rounds!: RoundManager;
  private mode = "tdm";

  // Recording / persistence (only when persistence is configured).
  private recorder: ReplayRecorder | null = null;
  private tickCount = 0;
  private startedAt = 0;
  private persisted = false;

  override onCreate(options: GameRoomOptions): void {
    const mapId = options?.mapId ?? "arena";
    const manifest = mapRegistry.get(mapId);
    const arena = manifest ? arenaFromManifest(manifest) : DEFAULT_ARENA;
    this.mode = options?.mode ?? "tdm";

    this.sim = new GameSimulation(arena);
    this.rounds = new RoundManager(this.sim);

    const state = new GameState();
    state.mapId = manifest?.id ?? "arena";
    this.setState(state);

    // Listable in the lobby with useful metadata (mapId, mode, player count).
    void this.setMetadata({ mapId: state.mapId, mode: this.mode });

    if (persistence) {
      this.recorder = new ReplayRecorder(state.mapId);
      this.startedAt = Date.now();
    }

    this.onMessage("input", (client: Client, cmd: InputCommand) => {
      this.sim.applyInput(client.sessionId, cmd);
      this.recorder?.recordInput(this.tickCount, client.sessionId, cmd);
    });

    // Authoritative fixed-step loop: advance round flow, then sync state.
    this.setSimulationInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  override onJoin(client: Client): void {
    this.sim.addPlayer(client.sessionId);
    this.recorder?.recordJoin(client.sessionId);
    this.state.players.set(client.sessionId, new PlayerState());
    this.syncPlayer(client.sessionId);
  }

  override onLeave(client: Client): void {
    this.sim.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private tick(): void {
    this.tickCount += 1;
    this.rounds.update();
    this.state.phase = this.rounds.phase;
    this.state.roundNumber = this.rounds.round;
    this.state.scoreT = this.rounds.scores.T;
    this.state.scoreCT = this.rounds.scores.CT;
    for (const id of this.sim.players.keys()) this.syncPlayer(id);

    if (this.recorder && this.tickCount % TICK_RATE === 0) {
      this.recorder.keyframe(this.tickCount, this.sim);
    }
    if (this.rounds.phase === "matchOver" && !this.persisted) {
      this.persisted = true;
      void this.persistMatch();
    }
  }

  /** On match end: store the replay blob and the match summary (best-effort). */
  private async persistMatch(): Promise<void> {
    if (!persistence || !this.recorder) return;
    const matchId = this.roomId;
    const { T, CT } = this.rounds.scores;
    const winnerTeam: "T" | "CT" | "draw" = CT > T ? "CT" : T > CT ? "T" : "draw";

    try {
      let replayUrl: string | undefined;
      if (persistence.replays) {
        this.recorder.keyframe(this.tickCount, this.sim);
        const bytes = serializeRecording(this.recorder.finish(this.tickCount));
        replayUrl = await persistence.replays.put(matchId, bytes);
      }
      const summary: MatchSummary = {
        id: matchId,
        mapId: this.state.mapId,
        mode: this.mode,
        startedAt: this.startedAt,
        endedAt: Date.now(),
        winnerTeam,
        replayUrl,
        players: [...this.sim.players].map(([userId, p]) => ({
          userId,
          team: p.team,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        })),
      };
      await persistence.db.saveMatch(summary);
    } catch (err) {
      console.error(`[cs] failed to persist match ${matchId}:`, err);
    }
  }

  private syncPlayer(id: string): void {
    const s = this.sim.get(id);
    const ps = this.state.players.get(id);
    if (!s || !ps) return;
    ps.x = s.pos.x;
    ps.y = s.pos.y;
    ps.z = s.pos.z;
    ps.yaw = s.yaw;
    ps.pitch = s.pitch;
    ps.lastProcessedSeq = s.lastSeq;
    ps.team = s.team;
    ps.hp = s.hp;
    ps.alive = s.alive;
    ps.kills = s.kills;
    ps.deaths = s.deaths;
    ps.assists = s.assists;
  }
}
