/**
 * Colyseus Schema — the state that is delta-synced to clients. Defined with the
 * `defineTypes` (non-decorator) API to avoid any decorator/toolchain coupling.
 * This is purely the wire shape; the authority lives in GameSimulation.
 */
import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class PlayerState extends Schema {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** Last input seq the server applied — the client reconciles against this. */
  lastProcessedSeq = 0;
  team = "";
}
defineTypes(PlayerState, {
  x: "number",
  y: "number",
  z: "number",
  yaw: "number",
  lastProcessedSeq: "number",
  team: "string",
});

export class GameState extends Schema {
  mapId = "";
  players = new MapSchema<PlayerState>();
}
defineTypes(GameState, {
  mapId: "string",
  players: { map: PlayerState },
});
