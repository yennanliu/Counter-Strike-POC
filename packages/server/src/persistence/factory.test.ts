import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchStoreFromEnv, replayStoreFromEnv } from "./factory.js";
import { SqliteMatchStore } from "./db.js";
import { FileReplayStore, MemoryReplayStore } from "./replayStore.js";

const tmp = mkdtempSync(join(tmpdir(), "cs-factory-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("persistence factory — env → adapter", () => {
  it("returns null when unset (persistence disabled)", () => {
    expect(matchStoreFromEnv(undefined)).toBeNull();
    expect(replayStoreFromEnv(undefined)).toBeNull();
  });

  it("builds a SQLite match store from a sqlite: url", () => {
    const store = matchStoreFromEnv("sqlite::memory:");
    expect(store).toBeInstanceOf(SqliteMatchStore);
  });

  it("builds file / memory replay stores from their urls", () => {
    expect(replayStoreFromEnv(`file:${tmp}`)).toBeInstanceOf(FileReplayStore);
    expect(replayStoreFromEnv("memory:")).toBeInstanceOf(MemoryReplayStore);
  });

  it("throws a clear error for deploy-only adapters not bundled in the POC", () => {
    expect(() => matchStoreFromEnv("postgres://localhost/cs")).toThrow(/postgres/i);
    expect(() => replayStoreFromEnv("s3://cs-replays")).toThrow(/s3/i);
  });

  it("throws on an unsupported scheme", () => {
    expect(() => matchStoreFromEnv("mysql://x")).toThrow();
    expect(() => replayStoreFromEnv("ftp://x")).toThrow();
  });
});
