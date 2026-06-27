/**
 * Replay blob storage behind one interface (system-design.md §3.1/§6.2). Local
 * dev writes files to a folder; production uses S3. The DB row keeps the returned
 * URL.
 *
 * Provided here:
 *  - FileReplayStore  — local folder (dev / single node).
 *  - MemoryReplayStore — in-process object store; stands in for S3 in tests.
 *
 * The production S3 adapter (`@aws-sdk/client-s3`) implements this same `put/get`
 * contract and is wired at deploy time — no caller changes.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ReplayStore {
  /** Store the (already-compressed) replay bytes; returns a retrievable URL. */
  put(matchId: string, data: Buffer): Promise<string>;
  /** Fetch the replay bytes, or undefined if absent. */
  get(matchId: string): Promise<Buffer | undefined>;
}

const fileName = (matchId: string) => `${matchId}.replay.gz`;

export class FileReplayStore implements ReplayStore {
  constructor(private readonly dir: string) {
    mkdirSync(this.dir, { recursive: true });
  }

  async put(matchId: string, data: Buffer): Promise<string> {
    const path = join(this.dir, fileName(matchId));
    writeFileSync(path, data);
    return `file://${path}`;
  }

  async get(matchId: string): Promise<Buffer | undefined> {
    const path = join(this.dir, fileName(matchId));
    return existsSync(path) ? readFileSync(path) : undefined;
  }
}

export class MemoryReplayStore implements ReplayStore {
  private readonly blobs = new Map<string, Buffer>();

  async put(matchId: string, data: Buffer): Promise<string> {
    this.blobs.set(matchId, Buffer.from(data));
    return `memory://${fileName(matchId)}`;
  }

  async get(matchId: string): Promise<Buffer | undefined> {
    const blob = this.blobs.get(matchId);
    return blob ? Buffer.from(blob) : undefined;
  }
}
