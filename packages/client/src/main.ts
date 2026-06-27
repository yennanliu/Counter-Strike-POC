/** Browser entry: lobby overlay → join a match on the chosen field. */
import { startGame } from "./game/app.js";

declare const __SERVER_URL__: string;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const mapSelect = document.getElementById("map") as HTMLSelectElement;
const logBox = document.getElementById("error")!;
const hud = {
  root: document.getElementById("hud")!,
  crosshair: document.getElementById("crosshair")!,
  status: document.getElementById("status")!,
  hp: document.getElementById("hp")!,
  scoreboard: document.getElementById("scoreboard")!,
};

function log(msg: string): void {
  const t = new Date().toTimeString().slice(0, 8);
  console.log("[cs]", msg);
  logBox.textContent += `${logBox.textContent ? "\n" : ""}${t}  ${msg}`;
  logBox.scrollTop = logBox.scrollHeight;
}

playBtn.addEventListener("click", async () => {
  playBtn.disabled = true;
  playBtn.textContent = "Connecting…";
  logBox.textContent = "";
  log(`endpoint = ${__SERVER_URL__}`);
  try {
    await startGame(canvas, hud, __SERVER_URL__, mapSelect.value, log);
    log("entering game — hiding overlay");
    overlay.setAttribute("hidden", "");
    hud.root.removeAttribute("hidden");
    hud.crosshair.removeAttribute("hidden");
  } catch (err) {
    playBtn.disabled = false;
    playBtn.textContent = "Try again";
    log(`✗ ERROR: ${(err as Error).message || "could not connect"}`);
    log("→ is the server running?  pnpm --filter @cs/server dev");
  }
});
