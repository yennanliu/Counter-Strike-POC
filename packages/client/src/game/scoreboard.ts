/** Scoreboard derivation — shared by the live HUD and the replay viewer. */
import type { Team } from "../net/types.js";

export interface ScoreRow {
  id: string;
  team: Team;
  kills: number;
  deaths: number;
  assists: number;
}

export interface ScorablePlayer {
  id: string;
  team: Team;
  kills: number;
  deaths: number;
  assists: number;
}

/** Rows sorted by kills desc, then fewest deaths, then id (stable & deterministic). */
export function scoreboardFrom(players: Iterable<ScorablePlayer>): ScoreRow[] {
  return [...players]
    .map((p) => ({
      id: p.id,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
    }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id));
}
