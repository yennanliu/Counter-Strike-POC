/**
 * Replay viewer model. Plays back a recorded match from its keyframes (positions
 * + stats over time) — no re-simulation needed on the client, so this stays
 * browser-safe (the server's gzip/sim code is type-only here). The app feeds
 * `keyframeAt(t)` into the same SceneManager used for live play.
 */
import type { ReplayRecording, Keyframe } from "@cs/server";
import type { Team } from "../net/types.js";
import { scoreboardFrom, type ScoreRow } from "../game/scoreboard.js";

export class ReplayViewer {
  constructor(private readonly rec: ReplayRecording) {}

  get finalTick(): number {
    return this.rec.header.finalTick;
  }

  /** Team is implied by join order (matches GameSimulation: even=CT, odd=T). */
  teamOf(id: string): Team {
    const idx = this.rec.joins.indexOf(id);
    return idx % 2 === 0 ? "CT" : "T";
  }

  /** The latest keyframe at or before `tick` (for scrubbing/seeking). */
  keyframeAt(tick: number): Keyframe | undefined {
    let best: Keyframe | undefined;
    for (const k of this.rec.keyframes) {
      if (k.t <= tick) best = k;
      else break;
    }
    return best;
  }

  finalScoreboard(): ScoreRow[] {
    const last = this.rec.keyframes.at(-1);
    if (!last) return [];
    return scoreboardFrom(
      last.players.map((p) => ({
        id: p.id,
        team: this.teamOf(p.id),
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
      })),
    );
  }
}
