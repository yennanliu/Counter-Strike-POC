import { describe, it, expect } from "vitest";
import {
  ReplayRecorder,
  replayToSim,
  serializeRecording,
  deserializeRecording,
} from "./recorder.js";
import { GameSimulation, type Arena } from "../sim/GameSimulation.js";
import { vec3, type InputCommand } from "@cs/shared";

const arena: Arena = {
  spawnsT: [vec3(0, 0, 0)],
  spawnsCT: [vec3(0, 0, 10)],
  colliders: [{ min: vec3(2, 0, -5), max: vec3(3, 3, 5) }],
};

/** Drive a live sim while recording, then return both for comparison. */
function recordedRun() {
  const live = new GameSimulation(arena);
  const rec = new ReplayRecorder("test-map", 5);
  for (const id of ["ct", "t"]) {
    live.addPlayer(id);
    rec.recordJoin(id);
  }
  let seqCt = 0;
  let seqT = 0;
  for (let t = 0; t < 20; t++) {
    const c1: InputCommand = { seq: ++seqCt, moveVec: { x: 0.4, z: 1 }, yaw: 0.3 };
    const c2: InputCommand = { seq: ++seqT, moveVec: { x: 1, z: 0 }, yaw: 1.1 };
    live.applyInput("ct", c1);
    rec.recordInput(t, "ct", c1);
    live.applyInput("t", c2);
    rec.recordInput(t, "t", c2);
    if (t % 5 === 0) rec.keyframe(t, live);
  }
  rec.keyframe(20, live);
  return { live, recording: rec.finish(20) };
}

describe("ReplayRecorder — T-071: input-log replay", () => {
  it("captures joins, per-tick inputs, and keyframes at the interval", () => {
    const { recording } = recordedRun();
    expect(recording.joins).toEqual(["ct", "t"]);
    expect(recording.inputs.length).toBe(40); // 2 players × 20 ticks
    expect(recording.keyframes.length).toBe(5); // t=0,5,10,15 + final at 20
    expect(recording.header.mapId).toBe("test-map");
  });

  it("serializes (gzip ndjson) and deserializes losslessly", () => {
    const { recording } = recordedRun();
    const buf = serializeRecording(recording);
    expect(buf.length).toBeGreaterThan(0);
    expect(deserializeRecording(buf)).toEqual(recording);
  });

  it("replaying the log reproduces the live final state exactly", () => {
    const { live, recording } = recordedRun();
    const replayed = replayToSim(deserializeRecording(serializeRecording(recording)), arena);

    for (const id of ["ct", "t"]) {
      const r = replayed.get(id)!;
      const l = live.get(id)!;
      expect(r.pos).toEqual(l.pos);
      expect(r.yaw).toBe(l.yaw);
      expect(r.hp).toBe(l.hp);
      expect(r.lastSeq).toBe(l.lastSeq);
    }
  });

  it("the final keyframe matches the replayed final state", () => {
    const { recording } = recordedRun();
    const replayed = replayToSim(recording, arena);
    const finalKf = recording.keyframes.at(-1)!;
    for (const kp of finalKf.players) {
      const rp = replayed.get(kp.id)!;
      expect(rp.pos.x).toBeCloseTo(kp.x);
      expect(rp.pos.z).toBeCloseTo(kp.z);
    }
  });
});
