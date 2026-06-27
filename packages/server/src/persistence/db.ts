/**
 * Match persistence behind one interface (system-design.md §8). Local dev uses
 * SQLite (Node's built-in `node:sqlite` — no native build); production swaps in a
 * Postgres adapter (RDS) implementing the same `MatchStore`. Only the adapter
 * chosen by env differs; callers are identical.
 *
 * Timestamps are passed in by the caller (epoch ms) — persistence never reads the
 * clock itself, keeping it testable.
 */
import { DatabaseSync } from "node:sqlite";

export type Team = "T" | "CT";

export interface MatchPlayerStat {
  userId: string;
  team: Team;
  kills: number;
  deaths: number;
  assists: number;
}

export interface MatchSummary {
  id: string;
  mapId: string;
  mode: string;
  startedAt: number;
  endedAt: number;
  winnerTeam: Team | "draw";
  /** Object-store URL of the recorded replay blob, if any. */
  replayUrl?: string;
  players: MatchPlayerStat[];
}

export interface MatchStore {
  init(): Promise<void>;
  saveMatch(match: MatchSummary): Promise<void>;
  getMatch(id: string): Promise<MatchSummary | undefined>;
  listMatchesByUser(userId: string, limit?: number): Promise<MatchSummary[]>;
  listRecent(limit?: number): Promise<MatchSummary[]>;
  close(): void;
}

interface MatchRow {
  id: string;
  map_id: string;
  mode: string;
  started_at: number;
  ended_at: number;
  winner_team: string;
  replay_url: string | null;
}

interface PlayerRow {
  user_id: string;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
}

export class SqliteMatchStore implements MatchStore {
  private readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        winner_team TEXT NOT NULL,
        replay_url TEXT
      );
      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches(id),
        user_id TEXT NOT NULL,
        team TEXT NOT NULL,
        kills INTEGER NOT NULL,
        deaths INTEGER NOT NULL,
        assists INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);
      CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at);
    `);
  }

  async saveMatch(m: MatchSummary): Promise<void> {
    const insertMatch = this.db.prepare(
      `INSERT INTO matches (id, map_id, mode, started_at, ended_at, winner_team, replay_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPlayer = this.db.prepare(
      `INSERT INTO match_players (match_id, user_id, team, kills, deaths, assists)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    this.db.exec("BEGIN");
    try {
      insertMatch.run(
        m.id,
        m.mapId,
        m.mode,
        m.startedAt,
        m.endedAt,
        m.winnerTeam,
        m.replayUrl ?? null,
      );
      for (const p of m.players) {
        insertPlayer.run(m.id, p.userId, p.team, p.kills, p.deaths, p.assists);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async getMatch(id: string): Promise<MatchSummary | undefined> {
    const row = this.db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as
      | unknown
      | undefined;
    if (!row) return undefined;
    return this.assemble(row as MatchRow);
  }

  async listMatchesByUser(userId: string, limit = 50): Promise<MatchSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT m.* FROM matches m
         JOIN match_players p ON p.match_id = m.id
         WHERE p.user_id = ?
         ORDER BY m.started_at DESC
         LIMIT ?`,
      )
      .all(userId, limit) as unknown as MatchRow[];
    return rows.map((r) => this.assemble(r));
  }

  async listRecent(limit = 50): Promise<MatchSummary[]> {
    const rows = this.db
      .prepare(`SELECT * FROM matches ORDER BY started_at DESC LIMIT ?`)
      .all(limit) as unknown as MatchRow[];
    return rows.map((r) => this.assemble(r));
  }

  close(): void {
    this.db.close();
  }

  private assemble(row: MatchRow): MatchSummary {
    const players = this.db
      .prepare(
        `SELECT user_id, team, kills, deaths, assists
         FROM match_players WHERE match_id = ? ORDER BY rowid`,
      )
      .all(row.id) as unknown as PlayerRow[];

    const summary: MatchSummary = {
      id: row.id,
      mapId: row.map_id,
      mode: row.mode,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      winnerTeam: row.winner_team as Team | "draw",
      players: players.map((p) => ({
        userId: p.user_id,
        team: p.team as Team,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
      })),
    };
    if (row.replay_url !== null) summary.replayUrl = row.replay_url;
    return summary;
  }
}
