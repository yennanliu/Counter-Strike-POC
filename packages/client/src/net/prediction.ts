/**
 * Client-side prediction + server reconciliation (Gabriel Gambetta's model).
 *
 * The client applies its own inputs immediately using the SAME shared sim the
 * server runs, so movement feels instant. Each input is kept until the server
 * acks it. When an authoritative snapshot arrives, we drop acked inputs and
 * replay the still-pending ones on top of the server position — converging
 * without rubber-banding.
 */
import {
  applyInput,
  type InputCommand,
  type MovementContext,
  type Vec3,
} from "@cs/shared";

export interface ServerSnapshot {
  pos: Vec3;
  /** The last input seq the server has applied for this client. */
  lastProcessedSeq: number;
}

export class Predictor {
  private predicted: Vec3;
  private pending: InputCommand[] = [];

  constructor(start: Vec3, private readonly ctx: MovementContext) {
    this.predicted = { x: start.x, y: start.y, z: start.z };
  }

  get position(): Vec3 {
    return this.predicted;
  }

  /** Apply an input locally now and remember it for later reconciliation. */
  predict(cmd: InputCommand): Vec3 {
    this.predicted = applyInput(this.predicted, cmd, this.ctx);
    this.pending.push(cmd);
    return this.predicted;
  }

  /** Rebase on the authoritative position, replaying inputs the server hasn't seen yet. */
  reconcile(snapshot: ServerSnapshot): Vec3 {
    this.pending = this.pending.filter((c) => c.seq > snapshot.lastProcessedSeq);
    let pos: Vec3 = { ...snapshot.pos };
    for (const cmd of this.pending) {
      pos = applyInput(pos, cmd, this.ctx);
    }
    this.predicted = pos;
    return this.predicted;
  }
}
