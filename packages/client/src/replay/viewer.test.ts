import { describe, it, expect } from "vitest";
import { ReplayViewer } from "./viewer.js";
import { scoreboardFrom } from "../game/scoreboard.js";
import { ReplayRecorder, GameSimulation, type Arena } from "@cs/server";
import { vec3, type InputCommand } from "@cs/shared";

/** Record a short match where CT one-shots T, then CT moves. */
function recordedMatch() {
  const arena: Arena = {
    spawnsCT: [vec3(0, 0, 0)],
    spawnsT: [vec3(0, 0, 5)],
    colliders: [],
  };
  const live = new GameSimulation(arena);
  const rec = new ReplayRecorder("arena", 3);
  for (const id of ["ct", "t"]) {
    live.addPlayer(id);
    rec.recordJoin(id);
  }
  let t = 0;
  const fire: InputCommand = { seq: 1, moveVec: { x: 0, z: 0 }, yaw: 0, fire: true };
  live.applyInput("ct", fire);
  rec.recordInput(t, "ct", fire);
  rec.keyframe(t, live);
  t++;
  for (let i = 0; i < 3; i++, t++) {
    const m: InputCommand = { seq: 2 + i, moveVec: { x: 0, z: 1 }, yaw: 0 };
    live.applyInput("ct", m);
    rec.recordInput(t, "ct", m);
  }
  rec.keyframe(t, live);
  return { live, recording: rec.finish(t) };
}

describe("ReplayViewer — T-082: replays to the same final scoreboard", () => {
  it("final scoreboard from the replay equals the live match's", () => {
    const { live, recording } = recordedMatch();
    const liveBoard = scoreboardFrom(
      [...live.players].map(([id, p]) => ({
        id,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
      })),
    );

    const viewer = new ReplayViewer(recording);
    expect(viewer.finalScoreboard()).toEqual(liveBoard);
    expect(viewer.finalScoreboard()[0]).toMatchObject({ id: "ct", kills: 1 });
  });

  it("derives team from join order and seeks keyframes by tick", () => {
    const { recording } = recordedMatch();
    const viewer = new ReplayViewer(recording);
    expect(viewer.teamOf("ct")).toBe("CT");
    expect(viewer.teamOf("t")).toBe("T");
    expect(viewer.finalTick).toBe(recording.header.finalTick);
    expect(viewer.keyframeAt(0)?.t).toBe(0);
    expect(viewer.keyframeAt(999)?.t).toBe(recording.keyframes.at(-1)!.t);
  });
});
