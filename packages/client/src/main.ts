/** Browser entry: lobby overlay → join a match on the chosen field. */
import { startGame } from "./game/app.js";

declare const __SERVER_URL__: string;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const mapSelect = document.getElementById("map") as HTMLSelectElement;
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
  try {
    await startGame(canvas, hud, __SERVER_URL__, mapSelect.value);
    overlay.setAttribute("hidden", "");
    hud.root.removeAttribute("hidden");
    hud.crosshair.removeAttribute("hidden");
  } catch (err) {
    playBtn.disabled = false;
    playBtn.textContent = "Join match";
    alert(`Could not connect to ${__SERVER_URL__}\n${(err as Error).message}\n\nStart the server: pnpm --filter @cs/server dev`);
  }
});
