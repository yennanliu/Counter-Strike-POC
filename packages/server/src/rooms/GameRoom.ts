/**
 * Colyseus room: the network adapter around the authoritative GameSimulation.
 * It owns no game logic — it translates joins/leaves/inputs into sim calls and
 * mirrors the sim's player state into the synced Schema. Inputs are applied
 * synchronously on receive (one input = one fixed sim step); Colyseus delta-syncs
 * the resulting state to all clients automatically.
 */
import { Room, type Client } from "@colyseus/core";
import type { InputCommand } from "@cs/shared";
import { GameState, PlayerState } from "../state/schema.js";
import { GameSimulation } from "../sim/GameSimulation.js";
import { DEFAULT_ARENA } from "../maps/arena.js";

export interface GameRoomOptions {
  mapId?: string;
}

export class GameRoom extends Room<GameState> {
  override maxClients = 5;
  private readonly sim = new GameSimulation(DEFAULT_ARENA);

  override onCreate(options: GameRoomOptions): void {
    const state = new GameState();
    state.mapId = options?.mapId ?? "arena";
    this.setState(state);

    this.onMessage("input", (client: Client, cmd: InputCommand) => {
      if (this.sim.applyInput(client.sessionId, cmd)) {
        this.syncPlayer(client.sessionId);
      }
    });
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

  private syncPlayer(id: string): void {
    const s = this.sim.get(id);
    const ps = this.state.players.get(id);
    if (!s || !ps) return;
    ps.x = s.pos.x;
    ps.y = s.pos.y;
    ps.z = s.pos.z;
    ps.yaw = s.yaw;
    ps.lastProcessedSeq = s.lastSeq;
    ps.team = s.team;
  }
}
