import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileReplayStore,
  MemoryReplayStore,
  type ReplayStore,
} from "./replayStore.js";

const tmp = mkdtempSync(join(tmpdir(), "cs-replay-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// Same contract suite runs against the local-fs adapter and the object-store
// (memory) adapter that stands in for S3 in tests.
const adapters: Array<[string, () => ReplayStore]> = [
  ["FileReplayStore (local)", () => new FileReplayStore(tmp)],
  ["MemoryReplayStore (S3 stand-in)", () => new MemoryReplayStore()],
];

describe.each(adapters)("ReplayStore — T-072: %s", (_name, make) => {
  it("put then get round-trips the bytes and returns a url", async () => {
    const store = make();
    const data = Buffer.from("the quick brown fox\n\x00\x01binary");
    const url = await store.put("match-123", data);
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);

    const back = await store.get("match-123");
    expect(back).toEqual(data);
  });

  it("returns undefined for a missing blob", async () => {
    const store = make();
    expect(await store.get("does-not-exist")).toBeUndefined();
  });
});
