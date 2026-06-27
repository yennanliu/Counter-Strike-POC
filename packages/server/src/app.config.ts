/**
 * Game-server configuration shared by the runtime entry (index.ts) and the
 * @colyseus/testing harness. Registers the rooms; transport/listen is handled by
 * the caller.
 */
import type { Server } from "@colyseus/core";
import { GameRoom } from "./rooms/GameRoom.js";

export interface AppConfig {
  initializeGameServer: (gameServer: Server) => void;
}

export const appConfig: AppConfig = {
  initializeGameServer: (gameServer) => {
    gameServer.define("game", GameRoom);
  },
};

export default appConfig;
