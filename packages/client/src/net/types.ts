/** Client-side mirrors of the synced server schema (kept independent of @cs/server). */
export type Team = "T" | "CT";

/** Broadcast by the server on every shot (see GameRoom). */
export interface ShotEvent {
  by: string;
  ox: number; oy: number; oz: number;
  ex: number; ey: number; ez: number;
  hit: boolean;
  target: string;
  dmg: number;
  head: boolean;
  killed: boolean;
}

export interface PlayerView {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  team: Team;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  lastProcessedSeq: number;
}
