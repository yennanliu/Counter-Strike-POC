/**
 * Framework-agnostic authoritative game core. Holds player state and advances it
 * from validated inputs using the SHARED deterministic sim. Knows nothing about
 * Colyseus/networking (that lives in GameRoom) or round flow (that lives in
 * RoundManager) — both drive this. Keeping the logic here makes it fast to test.
 */
import {
  applyInput as stepPlayer,
  raycast,
  forwardFromYawPitch,
  type InputCommand,
  type AABB,
  type Vec3,
  PLAYER_MAX_HP,
  PLAYER_EYE_HEIGHT,
  HEADSHOT_MULTIPLIER,
  MAX_PLAYERS,
  WEAPONS,
  type WeaponId,
} from "@cs/shared";

export type Team = "T" | "CT";

export interface PlayerSim {
  pos: Vec3;
  yaw: number;
  pitch: number;
  /** Highest input seq the server has applied (echoed for client reconciliation). */
  lastSeq: number;
  team: Team;
  /** Assigned spawn point; respawns return here. */
  spawn: Vec3;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** Who has damaged this player since last (re)spawn — drives assist credit. */
  damagedBy: Set<string>;
}

export interface Arena {
  spawnsT: readonly Vec3[];
  spawnsCT: readonly Vec3[];
  colliders: readonly AABB[];
}

export interface ShotResult {
  hit: boolean;
  targetId?: string;
  damage?: number;
  isHead?: boolean;
  killed?: boolean;
}

export class GameSimulation {
  readonly players = new Map<string, PlayerSim>();
  /** Gated by the round FSM: shots are ignored unless the round is live. */
  firingEnabled = true;

  constructor(private readonly arena: Arena) {}

  canAddPlayer(): boolean {
    return this.players.size < MAX_PLAYERS;
  }

  addPlayer(id: string): PlayerSim {
    if (!this.canAddPlayer()) {
      throw new Error(`room is full (max ${MAX_PLAYERS})`);
    }
    const team: Team = this.players.size % 2 === 0 ? "CT" : "T";
    const spawns = team === "CT" ? this.arena.spawnsCT : this.arena.spawnsT;
    const teamCount = [...this.players.values()].filter((p) => p.team === team).length;
    const spawn = spawns[teamCount % spawns.length]!;

    const player: PlayerSim = {
      pos: { x: spawn.x, y: spawn.y, z: spawn.z },
      yaw: 0,
      pitch: 0,
      lastSeq: 0,
      team,
      spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
      hp: PLAYER_MAX_HP,
      alive: true,
      kills: 0,
      deaths: 0,
      assists: 0,
      damagedBy: new Set(),
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

  aliveCount(team: Team): number {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team && p.alive) n++;
    return n;
  }

  teamCount(team: Team): number {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  /**
   * Apply one input authoritatively. Returns true if movement was applied.
   * Rejects unknown players and stale/replayed seqs; the shared sim clamps
   * oversized move vectors and resolves collisions. Fires if requested and
   * allowed.
   */
  applyInput(id: string, cmd: InputCommand): boolean {
    const player = this.players.get(id);
    if (!player) return false;
    if (cmd.seq <= player.lastSeq) return false;

    if (player.alive) {
      player.pos = stepPlayer(player.pos, cmd, { colliders: this.arena.colliders });
    }
    player.yaw = cmd.yaw;
    if (cmd.pitch !== undefined) player.pitch = cmd.pitch;
    player.lastSeq = cmd.seq;

    if (cmd.fire) this.fireShot(id);
    return true;
  }

  /** Resolve a hitscan shot from `shooterId` using their current pose. */
  fireShot(shooterId: string, weaponId: WeaponId = "rifle"): ShotResult {
    const shooter = this.players.get(shooterId);
    if (!this.firingEnabled || !shooter || !shooter.alive) return { hit: false };

    const weapon = WEAPONS[weaponId];
    const origin: Vec3 = {
      x: shooter.pos.x,
      y: shooter.pos.y + PLAYER_EYE_HEIGHT,
      z: shooter.pos.z,
    };
    const dir = forwardFromYawPitch(shooter.yaw, shooter.pitch);

    const targets = [...this.players.entries()]
      .filter(([id, p]) => id !== shooterId && p.alive)
      .map(([id, p]) => ({ id, pos: p.pos }));

    const res = raycast(
      { origin, dir },
      { targets, walls: this.arena.colliders, maxDistance: weapon.range },
    );
    if (!res.hit || res.targetId === undefined) return { hit: false };

    const target = this.players.get(res.targetId)!;
    const damage = weapon.damage * (res.isHead ? HEADSHOT_MULTIPLIER : 1);
    target.hp -= damage;
    target.damagedBy.add(shooterId);

    let killed = false;
    if (target.hp <= 0 && target.alive) {
      target.hp = 0;
      target.alive = false;
      target.deaths += 1;
      shooter.kills += 1;
      for (const attacker of target.damagedBy) {
        if (attacker !== shooterId) this.players.get(attacker)!.assists += 1;
      }
      killed = true;
    }

    return { hit: true, targetId: res.targetId, damage, isHead: res.isHead, killed };
  }

  /** Reset everyone to spawn, full HP, alive — for the start of a round. K/D/A persist. */
  respawnAll(): void {
    for (const p of this.players.values()) {
      p.pos = { x: p.spawn.x, y: p.spawn.y, z: p.spawn.z };
      p.hp = PLAYER_MAX_HP;
      p.alive = true;
      p.damagedBy.clear();
    }
  }
}
