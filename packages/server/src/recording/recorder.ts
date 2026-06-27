/**
 * Replay recording via the input-log model (system-design.md §6.2): the server is
 * authoritative and deterministic, so storing the join order + every input + a
 * periodic keyframe is enough to regenerate the whole match. Replaying the log
 * through the SAME GameSimulation reproduces the exact final state.
 *
 * Serialized as gzip'd newline-delimited JSON — compact and append-friendly.
 */
import { gzipSync, gunzipSync } from "node:zlib";
import { TICK_RATE, type InputCommand } from "@cs/shared";
import { GameSimulation, type Arena } from "../sim/GameSimulation.js";

export interface KeyframePlayer {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

export interface Keyframe {
  t: number;
  players: KeyframePlayer[];
}

export interface ReplayInput {
  t: number;
  id: string;
  cmd: InputCommand;
}

export interface ReplayRecording {
  header: {
    mapId: string;
    tickRate: number;
    keyframeInterval: number;
    finalTick: number;
  };
  joins: string[];
  inputs: ReplayInput[];
  keyframes: Keyframe[];
}

export class ReplayRecorder {
  private readonly joins: string[] = [];
  private readonly inputs: ReplayInput[] = [];
  private readonly keyframes: Keyframe[] = [];

  constructor(
    private readonly mapId: string,
    private readonly keyframeInterval = TICK_RATE, // ~1s of ticks
  ) {}

  recordJoin(id: string): void {
    this.joins.push(id);
  }

  recordInput(t: number, id: string, cmd: InputCommand): void {
    this.inputs.push({ t, id, cmd });
  }

  /** Snapshot all players at tick `t` (for fast seeking + a determinism check). */
  keyframe(t: number, sim: GameSimulation): void {
    const players: KeyframePlayer[] = [];
    for (const [id, p] of sim.players) {
      players.push({
        id,
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        hp: p.hp,
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
      });
    }
    this.keyframes.push({ t, players });
  }

  finish(finalTick: number): ReplayRecording {
    return {
      header: {
        mapId: this.mapId,
        tickRate: TICK_RATE,
        keyframeInterval: this.keyframeInterval,
        finalTick,
      },
      joins: [...this.joins],
      inputs: [...this.inputs],
      keyframes: [...this.keyframes],
    };
  }
}

/** Rebuild a GameSimulation by re-applying the recorded inputs in order. */
export function replayToSim(rec: ReplayRecording, arena: Arena): GameSimulation {
  const sim = new GameSimulation(arena);
  for (const id of rec.joins) sim.addPlayer(id);
  for (const input of rec.inputs) sim.applyInput(input.id, input.cmd);
  return sim;
}

type Line =
  | ({ type: "header" } & ReplayRecording["header"])
  | { type: "join"; id: string }
  | ({ type: "input" } & ReplayInput)
  | ({ type: "key" } & Keyframe);

export function serializeRecording(rec: ReplayRecording): Buffer {
  const lines: Line[] = [
    { type: "header", ...rec.header },
    ...rec.joins.map((id) => ({ type: "join" as const, id })),
    ...rec.inputs.map((i) => ({ type: "input" as const, ...i })),
    ...rec.keyframes.map((k) => ({ type: "key" as const, ...k })),
  ];
  return gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join("\n")));
}

export function deserializeRecording(buf: Buffer): ReplayRecording {
  const text = gunzipSync(buf).toString("utf8");
  const rec: ReplayRecording = {
    header: { mapId: "", tickRate: TICK_RATE, keyframeInterval: TICK_RATE, finalTick: 0 },
    joins: [],
    inputs: [],
    keyframes: [],
  };
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    const line = JSON.parse(raw) as Line;
    switch (line.type) {
      case "header": {
        const { type, ...header } = line;
        void type;
        rec.header = header;
        break;
      }
      case "join":
        rec.joins.push(line.id);
        break;
      case "input": {
        const { type, ...input } = line;
        void type;
        rec.inputs.push(input);
        break;
      }
      case "key": {
        const { type, ...kf } = line;
        void type;
        rec.keyframes.push(kf);
        break;
      }
    }
  }
  return rec;
}
