/**
 * Game-server configuration shared by the runtime entry (index.ts) and the
 * over-the-wire check. Registers the rooms; transport/listen is the caller's job.
 *
 * - "game"  : the authoritative GameRoom, with realtime lobby listing enabled so
 *             created rooms show up in the lobby with their map metadata.
 * - "lobby" : Colyseus's built-in LobbyRoom — clients join it to list/browse
 *             available game rooms (powers the future lobby UI).
 */
import { LobbyRoom, type Server } from "@colyseus/core";
import { GameRoom } from "./rooms/GameRoom.js";

export interface AppConfig {
  initializeGameServer: (gameServer: Server) => void;
}

export const appConfig: AppConfig = {
  initializeGameServer: (gameServer) => {
    gameServer.define("game", GameRoom).enableRealtimeListing();
    gameServer.define("lobby", LobbyRoom);
  },
};

export default appConfig;
