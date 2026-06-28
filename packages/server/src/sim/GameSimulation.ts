/**
 * Framework-agnostic authoritative game core. Holds player state and advances it
 * from validated inputs using the SHARED deterministic sim. Knows nothing about
 * Colyseus/networking (that lives in GameRoom). Now also covers per-weapon
 * spread/recoil (A1) and bomb plant/defuse (A5).
 */
import {
  applyInput as stepPlayer,
  raycast,
  forwardFromYawPitch,
  perturbDirection,
  mulberry32,
  type InputCommand,
  type AABB,
  type Vec3,
  type BombSite,
  PLAYER_MAX_HP,
  PLAYER_EYE_HEIGHT,
  HEADSHOT_MULTIPLIER,
  MAX_PLAYERS,
  WEAPONS,
  type WeaponId,
  DEFAULT_WEAPON,
  TICK_RATE,
  TICK_DT,
  BURST_RESET_SEC,
  PLANT_TIME_SEC,
  DEFUSE_TIME_SEC,
  BOMB_TIMER_SEC,
  BOMB_DEFUSE_RADIUS,
} from "@cs/shared";

export type Team = "T" | "CT";

const BURST_RESET_TICKS = Math.round(BURST_RESET_SEC * TICK_RATE);
const BOMB_TIMER_TICKS = Math.round(BOMB_TIMER_SEC * TICK_RATE);

export interface PlayerSim {
  pos: Vec3;
  yaw: number;
  pitch: number;
  lastSeq: number;
  team: Team;
  spawn: Vec3;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damagedBy: Set<string>;
  weapon: WeaponId;
  /** Consecutive shots in the current spray (drives recoil). */
  shotsInBurst: number;
  lastFireSeq: number;
  /** Whether the use key (plant/defuse) is held this tick. */
  using: boolean;
}

export interface Arena {
  spawnsT: readonly Vec3[];
  spawnsCT: readonly Vec3[];
  colliders: readonly AABB[];
  bombSites?: readonly BombSite[];
}

export interface ShotResult {
  fired: boolean;
  hit: boolean;
  targetId?: string;
  damage?: number;
  isHead?: boolean;
  killed?: boolean;
  origin: Vec3;
  end: Vec3;
}

export interface BombState {
  active: boolean;
  carrier: string | null;
  planted: boolean;
  pos: Vec3 | null;
  siteLabel: "A" | "B" | null;
  plantedTick: number;
  plantProgress: number;
  defuseProgress: number;
  detonated: boolean;
  defused: boolean;
}

interface RayResult {
  hit: boolean;
  targetId?: string;
  isHead?: boolean;
  damage: number;
  killed: boolean;
  end: Vec3;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const distXZ = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

export class GameSimulation {
  readonly players = new Map<string, PlayerSim>();
  firingEnabled = true;
  lastShot: ShotResult | null = null;
  /** Authoritative tick counter (GameRoom advances it). Drives bomb timing. */
  tick = 0;
  bomb: BombState = this.freshBomb();

  constructor(private readonly arena: Arena) {}

  private freshBomb(): BombState {
    return {
      active: false,
      carrier: null,
      planted: false,
      pos: null,
      siteLabel: null,
      plantedTick: 0,
      plantProgress: 0,
      defuseProgress: 0,
      detonated: false,
      defused: false,
    };
  }

  canAddPlayer(): boolean {
    return this.players.size < MAX_PLAYERS;
  }

  addPlayer(id: string): PlayerSim {
    if (!this.canAddPlayer()) throw new Error(`room is full (max ${MAX_PLAYERS})`);
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
      weapon: DEFAULT_WEAPON,
      shotsInBurst: 0,
      lastFireSeq: -1000,
      using: false,
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

  setWeapon(id: string, weapon: string): void {
    const p = this.players.get(id);
    if (p && weapon in WEAPONS) p.weapon = weapon as WeaponId;
  }

  applyInput(id: string, cmd: InputCommand): boolean {
    const player = this.players.get(id);
    if (!player) return false;
    if (cmd.seq <= player.lastSeq) return false;

    if (player.alive) {
      player.pos = stepPlayer(player.pos, cmd, { colliders: this.arena.colliders });
    }
    player.yaw = cmd.yaw;
    if (cmd.pitch !== undefined) player.pitch = cmd.pitch;
    player.using = cmd.use ?? false;
    player.lastSeq = cmd.seq;

    if (cmd.fire) {
      const w = WEAPONS[player.weapon];
      const minGap = Math.max(1, Math.round(w.fireIntervalSec * TICK_RATE));
      if (player.lastSeq - player.lastFireSeq >= minGap) this.fireShot(id);
    }
    return true;
  }

  /** Resolve a hitscan shot from `shooterId` (per-weapon spread/recoil/pellets). */
  fireShot(shooterId: string): ShotResult {
    const shooter = this.players.get(shooterId);
    if (!this.firingEnabled || !shooter || !shooter.alive) {
      return (this.lastShot = { fired: false, hit: false, origin: ZERO, end: ZERO });
    }

    const w = WEAPONS[shooter.weapon];
    // Reset the spray after an idle gap → first shot is accurate (CS-style).
    if (shooter.lastSeq - shooter.lastFireSeq > BURST_RESET_TICKS) shooter.shotsInBurst = 0;
    const burst = shooter.shotsInBurst;
    shooter.shotsInBurst = burst + 1;
    shooter.lastFireSeq = shooter.lastSeq;

    const spread =
      w.pellets > 1
        ? w.spread
        : burst === 0
          ? 0
          : Math.min(w.spread + w.recoilPerShot * burst, w.maxSpread);

    const origin: Vec3 = {
      x: shooter.pos.x,
      y: shooter.pos.y + PLAYER_EYE_HEIGHT,
      z: shooter.pos.z,
    };
    const baseDir = forwardFromYawPitch(shooter.yaw, shooter.pitch);
    const rng = mulberry32((shooter.lastSeq * 2654435761) >>> 0);

    let primary: RayResult | null = null;
    let totalDamage = 0;
    let anyKilled = false;
    let centerEnd: Vec3 = origin;
    for (let i = 0; i < w.pellets; i++) {
      const dir = perturbDirection(baseDir, spread, rng);
      const r = this.resolveRay(shooterId, shooter, origin, dir, w.damage, w.range);
      if (i === 0) centerEnd = r.end;
      if (r.hit) {
        totalDamage += r.damage;
        anyKilled = anyKilled || r.killed;
        if (!primary) primary = r;
      }
    }

    return (this.lastShot = primary
      ? {
          fired: true,
          hit: true,
          targetId: primary.targetId,
          damage: totalDamage,
          isHead: primary.isHead,
          killed: anyKilled,
          origin,
          end: primary.end,
        }
      : { fired: true, hit: false, origin, end: centerEnd });
  }

  private resolveRay(
    shooterId: string,
    shooter: PlayerSim,
    origin: Vec3,
    dir: Vec3,
    baseDamage: number,
    range: number,
  ): RayResult {
    const targets = [...this.players.entries()]
      .filter(([id]) => id !== shooterId && this.players.get(id)!.alive)
      .map(([id, p]) => ({ id, pos: p.pos }));

    const res = raycast({ origin, dir }, { targets, walls: this.arena.colliders, maxDistance: range });
    const end: Vec3 =
      res.hit && res.point
        ? res.point
        : { x: origin.x + dir.x * range, y: origin.y + dir.y * range, z: origin.z + dir.z * range };

    if (!res.hit || res.targetId === undefined) {
      return { hit: false, damage: 0, killed: false, end };
    }

    const target = this.players.get(res.targetId)!;
    const damage = baseDamage * (res.isHead ? HEADSHOT_MULTIPLIER : 1);
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
    return { hit: true, targetId: res.targetId, isHead: res.isHead, damage, killed, end };
  }

  /** Reset everyone to spawn + re-arm the bomb. K/D/A persist. */
  respawnAll(): void {
    for (const p of this.players.values()) {
      p.pos = { x: p.spawn.x, y: p.spawn.y, z: p.spawn.z };
      p.hp = PLAYER_MAX_HP;
      p.alive = true;
      p.damagedBy.clear();
      p.shotsInBurst = 0;
      p.using = false;
    }
    this.armBomb();
  }

  /** (Re)arm the bomb for a new round if the field has bomb sites. */
  armBomb(): void {
    this.bomb = this.freshBomb();
    const sites = this.arena.bombSites ?? [];
    if (sites.length === 0) return;
    this.bomb.active = true;
    for (const [id, p] of this.players) {
      if (p.team === "T") {
        this.bomb.carrier = id;
        break;
      }
    }
  }

  private siteAt(pos: Vec3): "A" | "B" | null {
    for (const s of this.arena.bombSites ?? []) {
      if (
        pos.x >= s.area.min.x && pos.x <= s.area.max.x &&
        pos.z >= s.area.min.z && pos.z <= s.area.max.z
      ) {
        return s.label;
      }
    }
    return null;
  }

  /** Advance bomb plant/defuse/detonation. Call once per tick (GameRoom). */
  updateBomb(): void {
    const b = this.bomb;
    if (!b.active || b.defused || b.detonated) return;

    if (!b.planted) {
      const planter = [...this.players.values()].find(
        (p) => p.team === "T" && p.alive && p.using && this.siteAt(p.pos) !== null,
      );
      if (planter) {
        b.plantProgress += TICK_DT / PLANT_TIME_SEC;
        if (b.plantProgress >= 1) {
          b.planted = true;
          b.plantProgress = 1;
          b.pos = { x: planter.pos.x, y: 0, z: planter.pos.z };
          b.plantedTick = this.tick;
          b.siteLabel = this.siteAt(planter.pos);
        }
      } else {
        b.plantProgress = 0;
      }
      return;
    }

    if (this.tick - b.plantedTick >= BOMB_TIMER_TICKS) {
      b.detonated = true;
      return;
    }
    const defuser = [...this.players.values()].find(
      (p) => p.team === "CT" && p.alive && p.using && b.pos !== null && distXZ(p.pos, b.pos) <= BOMB_DEFUSE_RADIUS,
    );
    if (defuser) {
      b.defuseProgress += TICK_DT / DEFUSE_TIME_SEC;
      if (b.defuseProgress >= 1) b.defused = true;
    } else {
      b.defuseProgress = 0;
    }
  }

  /** Seconds left on the planted bomb (0 if not planted). */
  bombTimeLeft(): number {
    if (!this.bomb.planted) return 0;
    return Math.max(0, BOMB_TIMER_SEC - (this.tick - this.bomb.plantedTick) / TICK_RATE);
  }
}
