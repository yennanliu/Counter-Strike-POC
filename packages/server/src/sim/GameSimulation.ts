/**
 * Framework-agnostic authoritative game core. Holds player state and advances it
 * from validated inputs using the SHARED deterministic sim. Knows nothing about
 * Colyseus/networking — that lives in GameRoom, which is a thin wrapper around
 * this. Keeping the logic here makes it fast and trivial to test.
 */
import {
  applyInput as stepPlayer,
  type InputCommand,
  type AABB,
  type Vec3,
} from "@cs/shared";

export type Team = "T" | "CT";

export interface PlayerSim {
  pos: Vec3;
  yaw: number;
  /** Highest input seq the server has applied for this player (echoed for reconciliation). */
  lastSeq: number;
  team: Team;
}

export interface Arena {
  /** Spawn points; players are placed round-robin. */
  spawns: readonly Vec3[];
  /** Static world collision boxes. */
  colliders: readonly AABB[];
}

export class GameSimulation {
  readonly players = new Map<string, PlayerSim>();

  constructor(private readonly arena: Arena) {}

  addPlayer(id: string): PlayerSim {
    const idx = this.players.size;
    const spawn = this.arena.spawns[idx % this.arena.spawns.length]!;
    const player: PlayerSim = {
      pos: { x: spawn.x, y: spawn.y, z: spawn.z },
      yaw: 0,
      lastSeq: 0,
      team: idx % 2 === 0 ? "CT" : "T",
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  get(id: string): PlayerSim | undefined {
    return this.players.get(id);
  }

  /**
   * Apply one input authoritatively. Returns true if it was applied.
   * Rejects unknown players and stale/replayed sequence numbers; the shared sim
   * itself clamps oversized move vectors and resolves collisions, so a hacked
   * client cannot move faster or through walls.
   */
  applyInput(id: string, cmd: InputCommand): boolean {
    const player = this.players.get(id);
    if (!player) return false;
    if (cmd.seq <= player.lastSeq) return false;

    player.pos = stepPlayer(player.pos, cmd, { colliders: this.arena.colliders });
    player.yaw = cmd.yaw;
    player.lastSeq = cmd.seq;
    return true;
  }
}
