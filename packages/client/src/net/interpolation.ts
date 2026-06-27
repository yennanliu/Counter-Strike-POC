/**
 * Entity interpolation for REMOTE players. We render them a fixed delay in the
 * past (default 100ms) and interpolate between the two snapshots that bracket the
 * render time, so other players move smoothly despite arriving at the discrete
 * server tick rate. Local player uses prediction (see prediction.ts), not this.
 */
import type { Vec3 } from "@cs/shared";

export interface TimedSnapshot {
  /** Wall-clock time (seconds) the snapshot represents. */
  t: number;
  pos: Vec3;
}

const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

export class InterpolationBuffer {
  private buf: TimedSnapshot[] = [];

  constructor(private readonly delay = 0.1) {}

  add(s: TimedSnapshot): void {
    this.buf.push(s);
    this.buf.sort((a, b) => a.t - b.t);
  }

  /** Position to render at wall-clock `now`; null if there is nothing buffered. */
  sample(now: number): Vec3 | null {
    if (this.buf.length === 0) return null;

    const rt = now - this.delay;
    const first = this.buf[0]!;
    const last = this.buf[this.buf.length - 1]!;

    if (rt <= first.t) return { ...first.pos };
    if (rt >= last.t) return { ...last.pos };

    for (let i = 0; i < this.buf.length - 1; i++) {
      const a = this.buf[i]!;
      const b = this.buf[i + 1]!;
      if (rt >= a.t && rt <= b.t) {
        const f = (rt - a.t) / (b.t - a.t);
        return {
          x: lerp(a.pos.x, b.pos.x, f),
          y: lerp(a.pos.y, b.pos.y, f),
          z: lerp(a.pos.z, b.pos.z, f),
        };
      }
    }
    return { ...last.pos };
  }
}
