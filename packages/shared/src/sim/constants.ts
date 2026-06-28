/**
 * Central tunable constants for the deterministic simulation.
 *
 * Everything in `sim/` imports from here so behavior is in one place and tests
 * can reason about exact numbers. No `Date.now()` / `Math.random()` anywhere in
 * `sim/` — time is the tick number and randomness (later) is a seeded PRNG.
 */

/** Server simulation rate, in Hz. */
export const TICK_RATE = 30;

/** Seconds advanced per simulation tick. */
export const TICK_DT = 1 / TICK_RATE;

/** Player ground move speed, in world units per second. */
export const PLAYER_SPEED = 5;

/** Player collision radius (XZ half-extent), in world units. */
export const PLAYER_RADIUS = 0.5;

/** Player full standing height, in world units. */
export const PLAYER_HEIGHT = 1.8;

/** Eye height for the first-person camera / shooting origin. */
export const PLAYER_EYE_HEIGHT = 1.6;

/**
 * Fraction of player height above which a hit counts as a headshot.
 * e.g. 0.85 → top 15% of the capsule is the head.
 */
export const HEADSHOT_HEIGHT_FRAC = 0.85;

/** Damage multiplier applied to headshots. */
export const HEADSHOT_MULTIPLIER = 4;

export interface WeaponSpec {
  readonly name: string;
  /** Base body damage per shot (per pellet for shotguns). */
  readonly damage: number;
  /** Effective range, in world units. */
  readonly range: number;
  /** Inaccuracy cone (radians) per spray shot / per shotgun pellet. */
  readonly spread: number;
  /** Extra spread added per consecutive shot (recoil climb). */
  readonly recoilPerShot: number;
  /** Hard cap on accumulated spread (radians). */
  readonly maxSpread: number;
  /** Minimum seconds between shots (server-enforced fire rate). */
  readonly fireIntervalSec: number;
  /** Number of rays per shot (>1 = shotgun). */
  readonly pellets: number;
}

export const WEAPONS = {
  // id           name           dmg  range  spread recoil  maxSpr  fire    pellets
  pistol:     { name: "pistol",      damage: 28,  range: 50,  spread: 0.012, recoilPerShot: 0.012, maxSpread: 0.09, fireIntervalSec: 0.18,  pellets: 1 },
  rifle:      { name: "rifle",       damage: 30,  range: 90,  spread: 0.014, recoilPerShot: 0.02,  maxSpread: 0.14, fireIntervalSec: 0.10,  pellets: 1 },
  smg:        { name: "smg",         damage: 22,  range: 60,  spread: 0.020, recoilPerShot: 0.014, maxSpread: 0.16, fireIntervalSec: 0.075, pellets: 1 },
  sniper:     { name: "sniper",      damage: 120, range: 150, spread: 0.0,   recoilPerShot: 0.05,  maxSpread: 0.20, fireIntervalSec: 1.2,   pellets: 1 },
  shotgun:    { name: "shotgun",     damage: 13,  range: 24,  spread: 0.07,  recoilPerShot: 0.02,  maxSpread: 0.12, fireIntervalSec: 0.8,   pellets: 8 },
  deagle:     { name: "deagle",      damage: 55,  range: 60,  spread: 0.015, recoilPerShot: 0.05,  maxSpread: 0.12, fireIntervalSec: 0.28,  pellets: 1 },
  // Machine gun: sustained fire, hits hard but sprays wide fast.
  lmg:        { name: "machine gun", damage: 29,  range: 110, spread: 0.022, recoilPerShot: 0.018, maxSpread: 0.24, fireIntervalSec: 0.07,  pellets: 1 },
  // Carbine: a lighter, faster, more accurate rifle (lower damage).
  carbine:    { name: "carbine",     damage: 25,  range: 80,  spread: 0.011, recoilPerShot: 0.015, maxSpread: 0.11, fireIntervalSec: 0.085, pellets: 1 },
  // Auto sniper: semi-auto sniper rifle — faster than the bolt sniper, less damage.
  autosniper: { name: "auto sniper", damage: 80,  range: 140, spread: 0.004, recoilPerShot: 0.045, maxSpread: 0.18, fireIntervalSec: 0.4,   pellets: 1 },
} as const satisfies Record<string, WeaponSpec>;

export type WeaponId = keyof typeof WEAPONS;

export const DEFAULT_WEAPON: WeaponId = "rifle";

/** A spray resets to first-shot accuracy after this idle gap (seconds). */
export const BURST_RESET_SEC = 0.25;

/** Starting health. */
export const PLAYER_MAX_HP = 100;

// ── Round timing (in seconds; converted to ticks where the FSM needs it) ──────
export const FREEZE_TIME_SEC = 3;
export const ROUND_TIME_SEC = 90;
/** Pause between a round ending and the next freeze phase. */
export const ROUND_END_TIME_SEC = 3;
export const ROUNDS_TO_WIN = 8;

/** Hard room cap (requirement #4). */
export const MAX_PLAYERS = 5;

// ── Bomb defusal mode (A5) ────────────────────────────────────────────────────
export const PLANT_TIME_SEC = 1.2;
export const DEFUSE_TIME_SEC = 5;
export const BOMB_TIMER_SEC = 40;
/** How close a CT must be to the planted bomb to defuse. */
export const BOMB_DEFUSE_RADIUS = 2.5;
