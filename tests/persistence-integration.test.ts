import { describe, it, expect } from "vitest";
import {
  GameSimulation,
  type Arena,
  ReplayRecorder,
  replayToSim,
  serializeRecording,
  deserializeRecording,
  SqliteMatchStore,
  MemoryReplayStore,
  type MatchSummary,
} from "@cs/server";
import { vec3, type InputCommand } from "@cs/shared";

/**
 * P5 exit criterion — play a scripted match, persist a summary to the DB and the
 * replay blob to the store, then reload both and prove the replay re-simulates to
 * the exact final state.
 *
 * Spawns are aligned so a single fired input is a deterministic one-shot kill,
 * keeping the whole match reproducible from inputs alone.
 */
const arena: Arena = {
  spawnsCT: [vec3(0, 0, 0)], // ct (idx 0)
  spawnsT: [vec3(0, 0, 5)], // t  (idx 1) — directly in front of ct
  colliders: [],
};

describe("persistence + replay end to end", () => {
  it("saves a match summary + replay blob and reproduces the match from the blob", async () => {
    // --- play & record a match ---
    const live = new GameSimulation(arena);
    const rec = new ReplayRecorder("arena", 5);
    for (const id of ["ct", "t"]) {
      live.addPlayer(id);
      rec.recordJoin(id);
    }

    let t = 0;
    const fire: InputCommand = { seq: 1, moveVec: { x: 0, z: 0 }, yaw: 0, fire: true };
    live.applyInput("ct", fire); // headshot → t dies
    rec.recordInput(t, "ct", fire);
    rec.keyframe(t, live);
    t++;

    for (let i = 0; i < 4; i++, t++) {
      const move: InputCommand = { seq: 2 + i, moveVec: { x: 0, z: 1 }, yaw: 0 };
      live.applyInput("ct", move);
      rec.recordInput(t, "ct", move);
    }
    rec.keyframe(t, live);
    const recording = rec.finish(t);

    expect(live.get("t")!.alive).toBe(false);
    expect(live.get("ct")!.kills).toBe(1);

    const matchId = "match-001";
    const winnerTeam = live.aliveCount("T") === 0 ? "CT" : "T";

    // --- persist replay blob + summary ---
    const replayStore = new MemoryReplayStore();
    const replayUrl = await replayStore.put(matchId, serializeRecording(recording));

    const db = new SqliteMatchStore(":memory:");
    await db.init();
    const summary: MatchSummary = {
      id: matchId,
      mapId: "arena",
      mode: "tdm",
      startedAt: 1000,
      endedAt: 1500,
      winnerTeam,
      replayUrl,
      players: [...live.players].map(([userId, p]) => ({
        userId,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
      })),
    };
    await db.saveMatch(summary);

    // --- reload summary ---
    const loaded = await db.getMatch(matchId);
    expect(loaded).toEqual(summary);
    expect(loaded!.winnerTeam).toBe("CT");
    expect(loaded!.replayUrl).toBe(replayUrl);

    // --- reload replay blob and re-simulate ---
    const blob = await replayStore.get(matchId);
    expect(blob).toBeDefined();
    const replayed = replayToSim(deserializeRecording(blob!), arena);

    for (const id of ["ct", "t"]) {
      const r = replayed.get(id)!;
      const l = live.get(id)!;
      expect(r.pos).toEqual(l.pos);
      expect(r.hp).toBe(l.hp);
      expect(r.alive).toBe(l.alive);
      expect(r.kills).toBe(l.kills);
      expect(r.deaths).toBe(l.deaths);
    }

    db.close();
  });
});
