/**
 * Pure input mapping — keyboard/mouse → move vector and aim. No DOM here so it's
 * unit-testable; the DOM listeners (controls.ts) call into these.
 */
import { clamp } from "@cs/shared";

export interface KeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/** Max look-up/down angle (radians) — just under vertical. */
export const PITCH_LIMIT = Math.PI / 2 - 0.05;

/** Mouse sensitivity (radians per pixel). */
export const MOUSE_SENSITIVITY = 0.0025;

/** Local move intent: x = strafe (+right), z = forward (+forward). */
export function keysToMoveVec(k: KeyState): { x: number; z: number } {
  let x = 0;
  let z = 0;
  if (k.forward) z += 1;
  if (k.back) z -= 1;
  if (k.right) x += 1;
  if (k.left) x -= 1;
  return { x, z };
}

const WEAPON_KEYS: Record<string, string> = {
  Digit1: "pistol",
  Digit2: "rifle",
  Digit3: "smg",
  Digit4: "sniper",
  Digit5: "shotgun",
  Digit6: "deagle",
};

/** Map a number-row key to a weapon id, or null. */
export function keyToWeapon(code: string): string | null {
  return WEAPON_KEYS[code] ?? null;
}

/** Map a KeyboardEvent.code to a movement action, or null if unbound. */
export function keyToAction(code: string): keyof KeyState | null {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      return "forward";
    case "KeyS":
    case "ArrowDown":
      return "back";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

/** Apply a mouse movement delta to yaw/pitch (pitch inverted + clamped). */
export function applyMouseDelta(
  yaw: number,
  pitch: number,
  dx: number,
  dy: number,
  sensitivity = MOUSE_SENSITIVITY,
): { yaw: number; pitch: number } {
  return {
    yaw: yaw + dx * sensitivity,
    pitch: clamp(pitch - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT),
  };
}
