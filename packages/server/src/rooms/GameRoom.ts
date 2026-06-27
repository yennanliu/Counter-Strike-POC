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

// One registry for the process — reads the map files once.
const mapRegistry = new MapRegistry();

export interface GameRoomOptions {
  mapId?: string;
  mode?: string;
}

export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS;
  private sim!: GameSimulation;
  private rounds!: RoundManager;

  override onCreate(options: GameRoomOptions): void {
    const mapId = options?.mapId ?? "arena";
    const manifest = mapRegistry.get(mapId);
    const arena = manifest ? arenaFromManifest(manifest) : DEFAULT_ARENA;

    this.sim = new GameSimulation(arena);
    this.rounds = new RoundManager(this.sim);

    const state = new GameState();
    state.mapId = manifest?.id ?? "arena";
    this.setState(state);

    // Listable in the lobby with useful metadata (mapId, mode, player count).
    void this.setMetadata({ mapId: state.mapId, mode: options?.mode ?? "tdm" });

    this.onMessage("input", (client: Client, cmd: InputCommand) => {
      this.sim.applyInput(client.sessionId, cmd);
    });

    // Authoritative fixed-step loop: advance round flow, then sync state.
    this.setSimulationInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  override onJoin(client: Client): void {
    this.sim.addPlayer(client.sessionId);
    this.state.players.set(client.sessionId, new PlayerState());
    this.syncPlayer(client.sessionId);
  }

  override onLeave(client: Client): void {
    this.sim.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private tick(): void {
    this.rounds.update();
    this.state.phase = this.rounds.phase;
    this.state.roundNumber = this.rounds.round;
    this.state.scoreT = this.rounds.scores.T;
    this.state.scoreCT = this.rounds.scores.CT;
    for (const id of this.sim.players.keys()) this.syncPlayer(id);
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
