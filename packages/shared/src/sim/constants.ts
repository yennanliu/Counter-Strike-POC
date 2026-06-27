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
  /** Base body damage per shot. */
  readonly damage: number;
  /** Effective range, in world units. */
  readonly range: number;
}

export const WEAPONS = {
  pistol: { name: "pistol", damage: 25, range: 50 },
  rifle: { name: "rifle", damage: 30, range: 80 },
} as const satisfies Record<string, WeaponSpec>;

export type WeaponId = keyof typeof WEAPONS;

/** Starting health. */
export const PLAYER_MAX_HP = 100;

// ── Round timing (in seconds; converted to ticks where the FSM needs it) ──────
export const FREEZE_TIME_SEC = 5;
export const ROUND_TIME_SEC = 90;
export const ROUNDS_TO_WIN = 8;
