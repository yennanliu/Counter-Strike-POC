/** Browser entry: game center (field list + live counts) → join / leave a match. */
import { ALL_MAPS } from "@cs/shared";
import { startGame, type GameSession } from "./game/app.js";
import { Lobby, type FieldCounts } from "./game/lobby.js";

declare const __SERVER_URL__: string;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const fieldsEl = document.getElementById("fields")!;
const logBox = document.getElementById("error")!;
const quitBtn = document.getElementById("quit") as HTMLButtonElement;
const hud = {
  root: document.getElementById("hud")!,
  crosshair: document.getElementById("crosshair")!,
  status: document.getElementById("status")!,
  banner: document.getElementById("banner")!,
  bombhud: document.getElementById("bombhud")!,
  hp: document.getElementById("hp")!,
  weapon: document.getElementById("weapon")!,
  scoreboard: document.getElementById("scoreboard")!,
  dmgflash: document.getElementById("dmgflash")!,
  dmgdir: document.getElementById("dmgdir")!,
};

function log(msg: string): void {
  const t = new Date().toTimeString().slice(0, 8);
  console.log("[cs]", msg);
  logBox.textContent += `${logBox.textContent ? "\n" : ""}${t}  ${msg}`;
  logBox.scrollTop = logBox.scrollHeight;
}

let session: GameSession | null = null;
let counts: FieldCounts = {};

// Build the field cards once; counts + join buttons update live.
const cards = new Map<string, { count: HTMLElement; button: HTMLButtonElement }>();
for (const map of ALL_MAPS) {
  const el = document.createElement("div");
  el.className = "field";
  el.dataset.map = map.id;
  el.innerHTML = `<h3>${map.name}</h3><div class="count">—</div>`;
  const button = document.createElement("button");
  button.textContent = "Join";
  button.dataset.map = map.id;
  button.addEventListener("click", () => join(map.id));
  el.appendChild(button);
  fieldsEl.appendChild(el);
  cards.set(map.id, { count: el.querySelector(".count") as HTMLElement, button });
}

function renderCounts(): void {
  for (const [mapId, { count }] of cards) {
    const n = counts[mapId] ?? 0;
    count.innerHTML = n > 0 ? `<b>${n}</b> playing` : `0 playing`;
  }
}
renderCounts();

const lobby = new Lobby(__SERVER_URL__, (c) => {
  counts = c;
  renderCounts();
});
lobby.connect().catch((e) => log(`lobby unavailable: ${(e as Error).message}`));

function showGameCenter(): void {
  session = null;
  overlay.removeAttribute("hidden");
  hud.root.setAttribute("hidden", "");
  hud.crosshair.setAttribute("hidden", "");
  quitBtn.setAttribute("hidden", "");
  for (const { button } of cards.values()) {
    button.disabled = false;
    button.textContent = "Join";
  }
  lobby.connect().catch(() => {});
}

async function join(mapId: string): Promise<void> {
  logBox.textContent = "";
  for (const { button } of cards.values()) button.disabled = true;
  const card = cards.get(mapId);
  if (card) card.button.textContent = "Connecting…";
  log(`endpoint = ${__SERVER_URL__}`);
  try {
    await lobby.leave(); // free the lobby connection while in-match
    session = await startGame(canvas, hud, __SERVER_URL__, mapId, log);
    overlay.setAttribute("hidden", "");
    hud.root.removeAttribute("hidden");
    hud.crosshair.removeAttribute("hidden");
    quitBtn.removeAttribute("hidden");
  } catch (err) {
    log(`✗ ERROR: ${(err as Error).message || "could not connect"}`);
    log("→ is the server running?  pnpm --filter @cs/server dev");
    showGameCenter();
  }
}

quitBtn.addEventListener("click", () => {
  session?.leave();
  showGameCenter();
});
