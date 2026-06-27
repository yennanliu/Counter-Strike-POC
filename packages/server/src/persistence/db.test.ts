import { describe, it, expect } from "vitest";
import { SqliteMatchStore, type MatchSummary } from "./db.js";

function sampleMatch(over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "m1",
    mapId: "arena",
    mode: "tdm",
    startedAt: 1000,
    endedAt: 2000,
    winnerTeam: "CT",
    replayUrl: "file://replays/m1.replay.gz",
    players: [
      { userId: "alice", team: "CT", kills: 5, deaths: 2, assists: 1 },
      { userId: "bob", team: "T", kills: 2, deaths: 5, assists: 3 },
    ],
    ...over,
  };
}

describe("SqliteMatchStore — T-070: match summary round-trip", () => {
  it("saveMatch then getMatch round-trips all fields including players", async () => {
    const store = new SqliteMatchStore(":memory:");
    await store.init();
    const m = sampleMatch();
    await store.saveMatch(m);
    expect(await store.getMatch("m1")).toEqual(m);
    store.close();
  });

  it("returns undefined for an unknown match", async () => {
    const store = new SqliteMatchStore(":memory:");
    await store.init();
    expect(await store.getMatch("nope")).toBeUndefined();
    store.close();
  });

  it("lists a user's matches most-recent-first", async () => {
    const store = new SqliteMatchStore(":memory:");
    await store.init();
    await store.saveMatch(sampleMatch({ id: "m1", startedAt: 1000 }));
    await store.saveMatch(sampleMatch({ id: "m2", startedAt: 3000 }));
    await store.saveMatch(sampleMatch({ id: "m3", startedAt: 2000 }));

    const ids = (await store.listMatchesByUser("alice")).map((m) => m.id);
    expect(ids).toEqual(["m2", "m3", "m1"]);
    store.close();
  });

  it("listMatchesByUser only returns matches the user played", async () => {
    const store = new SqliteMatchStore(":memory:");
    await store.init();
    await store.saveMatch(
      sampleMatch({
        id: "m1",
        players: [{ userId: "carol", team: "T", kills: 0, deaths: 0, assists: 0 }],
      }),
    );
    expect(await store.listMatchesByUser("alice")).toEqual([]);
    expect((await store.listMatchesByUser("carol")).map((m) => m.id)).toEqual(["m1"]);
    store.close();
  });
});
