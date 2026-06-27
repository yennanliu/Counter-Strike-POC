/** Client-side mirrors of the synced server schema (kept independent of @cs/server). */
export type Team = "T" | "CT";

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
