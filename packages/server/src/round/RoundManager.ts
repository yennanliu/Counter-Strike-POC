/**
 * Round flow finite state machine (CS-lite). Pure and tick-driven so it is fully
 * deterministic and testable: call `update()` once per server tick.
 *
 *   freeze ──(freezeTicks)──▶ live ──(elimination | timer)──▶ ended
 *      ▲                                                         │
 *      └──────────── nextRound (respawn) ◀──(endTicks)──────────┤
 *                                                               ▼
 *                                            (a team hit roundsToWin) → matchOver
 *
 * It owns no combat/movement logic — it gates firing and triggers respawns on the
 * GameSimulation, and reads alive/team counts from it.
 */
import {
  FREEZE_TIME_SEC,
  ROUND_TIME_SEC,
  ROUND_END_TIME_SEC,
  ROUNDS_TO_WIN,
  TICK_RATE,
} from "@cs/shared";
import type { GameSimulation, Team } from "../sim/GameSimulation.js";

export type RoundPhase = "freeze" | "live" | "ended" | "matchOver";

export interface RoundConfig {
  freezeTicks: number;
  roundTicks: number;
  endTicks: number;
  roundsToWin: number;
}

export const DEFAULT_ROUND_CONFIG: RoundConfig = {
  freezeTicks: Math.round(FREEZE_TIME_SEC * TICK_RATE),
  roundTicks: Math.round(ROUND_TIME_SEC * TICK_RATE),
  endTicks: Math.round(ROUND_END_TIME_SEC * TICK_RATE),
  roundsToWin: ROUNDS_TO_WIN,
};

export class RoundManager {
  phase: RoundPhase = "freeze";
  round = 1;
  ticksInPhase = 0;
  scores: Record<Team, number> = { T: 0, CT: 0 };
  lastWinner: Team | null = null;

  constructor(
    private readonly sim: GameSimulation,
    private readonly cfg: RoundConfig = DEFAULT_ROUND_CONFIG,
  ) {
    this.enterFreeze();
  }

  update(): void {
    this.ticksInPhase += 1;
    switch (this.phase) {
      case "freeze":
        if (this.ticksInPhase >= this.cfg.freezeTicks) this.enterLive();
        break;
      case "live":
        this.updateLive();
        break;
      case "ended":
        if (this.ticksInPhase >= this.cfg.endTicks) this.afterEnd();
        break;
      case "matchOver":
        break;
    }
  }

  private updateLive(): void {
    const tAlive = this.sim.aliveCount("T");
    const ctAlive = this.sim.aliveCount("CT");

    if (this.sim.teamCount("T") > 0 && tAlive === 0) return this.endRound("CT");
    if (this.sim.teamCount("CT") > 0 && ctAlive === 0) return this.endRound("T");
    if (this.ticksInPhase >= this.cfg.roundTicks) return this.endRound("CT"); // timer → defenders
  }

  private enterFreeze(): void {
    this.phase = "freeze";
    this.ticksInPhase = 0;
    this.sim.firingEnabled = false;
    this.sim.respawnAll();
  }

  private enterLive(): void {
    this.phase = "live";
    this.ticksInPhase = 0;
    this.sim.firingEnabled = true;
  }

  private endRound(winner: Team): void {
    this.scores[winner] += 1;
    this.lastWinner = winner;
    this.phase = "ended";
    this.ticksInPhase = 0;
    this.sim.firingEnabled = false;
  }

  private afterEnd(): void {
    if (this.scores.T >= this.cfg.roundsToWin || this.scores.CT >= this.cfg.roundsToWin) {
      this.phase = "matchOver";
      this.ticksInPhase = 0;
      this.sim.firingEnabled = false;
      return;
    }
    this.round += 1;
    this.enterFreeze();
  }
}
