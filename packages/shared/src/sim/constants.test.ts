import { describe, it, expect } from "vitest";
import {
  TICK_RATE,
  TICK_DT,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  HEADSHOT_HEIGHT_FRAC,
  HEADSHOT_MULTIPLIER,
  PLAYER_MAX_HP,
  WEAPONS,
  FREEZE_TIME_SEC,
  ROUND_TIME_SEC,
  ROUNDS_TO_WIN,
} from "./constants.js";

// T (P1) — constants config-shape: every tunable is sane.
describe("sim constants", () => {
  it("tick rate and dt are consistent and positive", () => {
    expect(TICK_RATE).toBeGreaterThan(0);
    expect(TICK_DT).toBeCloseTo(1 / TICK_RATE);
  });

  it("player dimensions and speed are positive", () => {
    expect(PLAYER_SPEED).toBeGreaterThan(0);
    expect(PLAYER_RADIUS).toBeGreaterThan(0);
    expect(PLAYER_HEIGHT).toBeGreaterThan(0);
    expect(PLAYER_MAX_HP).toBeGreaterThan(0);
  });

  it("headshot tuning is in a sensible range", () => {
    expect(HEADSHOT_HEIGHT_FRAC).toBeGreaterThan(0);
    expect(HEADSHOT_HEIGHT_FRAC).toBeLessThan(1);
    expect(HEADSHOT_MULTIPLIER).toBeGreaterThan(1);
  });

  it("every weapon has positive damage and range", () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.damage).toBeGreaterThan(0);
      expect(w.range).toBeGreaterThan(0);
    }
  });

  it("round timing is sane", () => {
    expect(FREEZE_TIME_SEC).toBeGreaterThanOrEqual(0);
    expect(ROUND_TIME_SEC).toBeGreaterThan(0);
    expect(ROUNDS_TO_WIN).toBeGreaterThan(0);
  });
});
