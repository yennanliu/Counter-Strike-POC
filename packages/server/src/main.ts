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
import { configurePersistence } from "./rooms/GameRoom.js";
import { matchStoreFromEnv, replayStoreFromEnv } from "./persistence/factory.js";

const port = Number(process.env.PORT ?? 2567);

// Wire persistence from env (DB_URL / REPLAY_STORE). Unset → disabled.
const db = matchStoreFromEnv(process.env.DB_URL);
if (db) {
  await db.init();
  configurePersistence({ db, replays: replayStoreFromEnv(process.env.REPLAY_STORE) });
  console.log(`[cs] persistence enabled (DB_URL=${process.env.DB_URL})`);
}

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
