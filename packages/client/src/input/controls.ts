/**
 * DOM input — pointer-lock mouse-look + keyboard, delegating to the pure mapping
 * functions. Supports click-and-hold auto-fire (rate-limited) for easier play.
 */
import { keyToAction, applyMouseDelta, type KeyState } from "./mapping.js";

/** Auto-fire cadence while the mouse is held (ms between shots). */
const FIRE_INTERVAL_MS = 140;

export class Controls {
  readonly keys: KeyState = { forward: false, back: false, left: false, right: false };
  yaw = 0;
  pitch = 0;
  private mouseDown = false;
  private lastShot = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      const action = keyToAction(e.code);
      if (action) this.keys[action] = true;
    });
    window.addEventListener("keyup", (e) => {
      const action = keyToAction(e.code);
      if (action) this.keys[action] = false;
    });

    canvas.addEventListener("mousedown", () => {
      if (document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock();
      } else {
        this.mouseDown = true;
      }
    });
    window.addEventListener("mouseup", () => (this.mouseDown = false));

    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas) return;
      const next = applyMouseDelta(this.yaw, this.pitch, e.movementX, e.movementY);
      this.yaw = next.yaw;
      this.pitch = next.pitch;
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** True at most once per FIRE_INTERVAL_MS while the mouse is held & locked. */
  consumeFire(nowMs: number): boolean {
    if (!this.mouseDown || !this.locked) return false;
    if (nowMs - this.lastShot < FIRE_INTERVAL_MS) return false;
    this.lastShot = nowMs;
    return true;
  }
}
