/**
 * DOM input — pointer-lock mouse-look + keyboard, delegating to the pure mapping
 * functions. Exposes the current KeyState, yaw/pitch, and a one-shot fire flag.
 */
import { keyToAction, applyMouseDelta, type KeyState } from "./mapping.js";

export class Controls {
  readonly keys: KeyState = { forward: false, back: false, left: false, right: false };
  yaw = 0;
  pitch = 0;
  private fireQueued = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      const action = keyToAction(e.code);
      if (action) this.keys[action] = true;
    });
    window.addEventListener("keyup", (e) => {
      const action = keyToAction(e.code);
      if (action) this.keys[action] = false;
    });
    canvas.addEventListener("click", () => {
      if (document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock();
      } else {
        this.fireQueued = true;
      }
    });
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

  /** Returns true once per click, then resets. */
  consumeFire(): boolean {
    const f = this.fireQueued;
    this.fireQueued = false;
    return f;
  }
}
