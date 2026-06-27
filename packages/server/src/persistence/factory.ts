/**
 * Pick persistence adapters from env-style URLs (see .env.example), so dev and
 * prod differ only by config:
 *   DB_URL=sqlite:./data/dev.db        |  postgres://… (deploy)
 *   REPLAY_STORE=file:./data/replays   |  s3://bucket  (deploy)
 *
 * Returns null when unset → persistence is simply disabled (matches/replays not
 * saved), which is the default for tests and local play.
 */
import { type MatchStore, SqliteMatchStore } from "./db.js";
import { type ReplayStore, FileReplayStore, MemoryReplayStore } from "./replayStore.js";

export function matchStoreFromEnv(dbUrl: string | undefined): MatchStore | null {
  if (!dbUrl) return null;
  if (dbUrl.startsWith("sqlite:")) {
    return new SqliteMatchStore(dbUrl.slice("sqlite:".length) || ":memory:");
  }
  if (dbUrl.startsWith("postgres:")) {
    throw new Error(
      "Postgres match store is a deploy-time adapter (RDS), not bundled in the POC; " +
        "implement PostgresMatchStore behind MatchStore and wire it here.",
    );
  }
  throw new Error(`unsupported DB_URL scheme: ${dbUrl}`);
}

export function replayStoreFromEnv(url: string | undefined): ReplayStore | null {
  if (!url) return null;
  if (url.startsWith("file:")) return new FileReplayStore(url.slice("file:".length));
  if (url.startsWith("memory:")) return new MemoryReplayStore();
  if (url.startsWith("s3:")) {
    throw new Error(
      "S3 replay store is a deploy-time adapter (@aws-sdk/client-s3), not bundled " +
        "in the POC; implement S3ReplayStore behind ReplayStore and wire it here.",
    );
  }
  throw new Error(`unsupported REPLAY_STORE scheme: ${url}`);
}
