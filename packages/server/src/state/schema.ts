/**
 * Colyseus Schema — the state that is delta-synced to clients. Defined with the
 * `defineTypes` (non-decorator) API. Purely the wire shape; authority lives in
 * GameSimulation, round flow in RoundManager.
 */
import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class PlayerState extends Schema {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  /** Last input seq the server applied — the client reconciles against this. */
  lastProcessedSeq = 0;
  team = "";
  hp = 0;
  alive = true;
  kills = 0;
  deaths = 0;
  assists = 0;
}
defineTypes(PlayerState, {
  x: "number",
  y: "number",
  z: "number",
  yaw: "number",
  pitch: "number",
  lastProcessedSeq: "number",
  team: "string",
  hp: "number",
  alive: "boolean",
  kills: "number",
  deaths: "number",
  assists: "number",
});

export class GameState extends Schema {
  mapId = "";
  /** "freeze" | "live" | "ended" | "matchOver" */
  phase = "freeze";
  roundNumber = 1;
  scoreT = 0;
  scoreCT = 0;
  players = new MapSchema<PlayerState>();
}
defineTypes(GameState, {
  mapId: "string",
  phase: "string",
  roundNumber: "number",
  scoreT: "number",
  scoreCT: "number",
  players: { map: PlayerState },
});
