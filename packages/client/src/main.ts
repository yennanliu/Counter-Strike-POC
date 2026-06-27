/** Browser entry: lobby overlay → join a match on the chosen field. */
import { startGame } from "./game/app.js";

declare const __SERVER_URL__: string;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const mapSelect = document.getElementById("map") as HTMLSelectElement;
const errorBox = document.getElementById("error")!;
const hud = {
  root: document.getElementById("hud")!,
  crosshair: document.getElementById("crosshair")!,
  status: document.getElementById("status")!,
  hp: document.getElementById("hp")!,
  scoreboard: document.getElementById("scoreboard")!,
};

playBtn.addEventListener("click", async () => {
  playBtn.disabled = true;
  playBtn.textContent = "Connecting…";
  errorBox.textContent = "";
  try {
    await startGame(canvas, hud, __SERVER_URL__, mapSelect.value);
    overlay.setAttribute("hidden", "");
    hud.root.removeAttribute("hidden");
    hud.crosshair.removeAttribute("hidden");
  } catch (err) {
    playBtn.disabled = false;
    playBtn.textContent = "Join match";
    const detail = (err as Error).message || "could not reach the server";
    errorBox.innerHTML =
      `⚠️ Couldn't join at <code>${__SERVER_URL__}</code>.<br>${detail}<br>` +
      `Make sure the server is running: <code>pnpm --filter @cs/server dev</code>`;
    console.error("[cs] join failed:", err);
  }
});
