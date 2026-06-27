/**
 * Runtime entry point: boots a Colyseus server with the pure-`ws` transport and
 * the rooms from app.config. Run with `pnpm --filter @cs/server dev`.
 *
 * Kept separate from index.ts so importing the package (tests, tooling) never
 * starts listening on a port.
 */
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { appConfig } from "./app.config.js";

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

appConfig.initializeGameServer(gameServer);

gameServer
  .listen(port)
  .then(() => console.log(`[cs] game server listening on ws://localhost:${port}`))
  .catch((err) => {
    console.error("[cs] failed to start:", err);
    process.exit(1);
  });
