import { describe, it, expect } from "vitest";
import { GameSimulation, type Arena } from "./GameSimulation.js";
import { RoundManager } from "../round/RoundManager.js";
import { vec3, PLANT_TIME_SEC, DEFUSE_TIME_SEC, BOMB_TIMER_SEC, TICK_RATE } from "@cs/shared";

const bombArena: Arena = {
  spawnsCT: [vec3(0, 0, -6)],
  spawnsT: [vec3(0, 0, 6)],
  colliders: [],
  bombSites: [{ label: "A", area: { min: vec3(-2, 0, -2), max: { x: 2, y: 0.3, z: 2 } } }],
};

function armedSim() {
  const sim = new GameSimulation(bombArena);
  sim.addPlayer("ct"); // CT
  sim.addPlayer("t"); // T
  sim.armBomb();
  return sim;
}

describe("bomb defusal (A5)", () => {
  it("activates on a field with bomb sites and assigns a T carrier", () => {
    const sim = armedSim();
    expect(sim.bomb.active).toBe(true);
    expect(sim.bomb.carrier).toBe("t");
  });

  it("a T in the site holding use plants the bomb after PLANT_TIME", () => {
    const sim = armedSim();
    const t = sim.get("t")!;
    t.pos = vec3(0, 0, 0); // inside site A
    t.using = true;
    const ticks = Math.ceil(PLANT_TIME_SEC * TICK_RATE) + 2;
    for (let i = 0; i < ticks; i++) sim.updateBomb();
    expect(sim.bomb.planted).toBe(true);
    expect(sim.bomb.siteLabel).toBe("A");
  });

  it("resets plant progress if the planter stops/leaves before completion", () => {
    const sim = armedSim();
    const t = sim.get("t")!;
    t.pos = vec3(0, 0, 0);
    t.using = true;
    sim.updateBomb();
    expect(sim.bomb.plantProgress).toBeGreaterThan(0);
    t.using = false; // stopped
    sim.updateBomb();
    expect(sim.bomb.plantProgress).toBe(0);
    expect(sim.bomb.planted).toBe(false);
  });

  it("a CT near the planted bomb holding use defuses it after DEFUSE_TIME", () => {
    const sim = armedSim();
    // plant
    const t = sim.get("t")!;
    t.pos = vec3(0, 0, 0);
    t.using = true;
    for (let i = 0; i < Math.ceil(PLANT_TIME_SEC * TICK_RATE) + 1; i++) sim.updateBomb();
    expect(sim.bomb.planted).toBe(true);
    t.using = false;
    // defuse
    const ct = sim.get("ct")!;
    ct.pos = vec3(0, 0, 0);
    ct.using = true;
    for (let i = 0; i < Math.ceil(DEFUSE_TIME_SEC * TICK_RATE) + 2; i++) sim.updateBomb();
    expect(sim.bomb.defused).toBe(true);
  });

  it("detonates when the bomb timer expires", () => {
    const sim = armedSim();
    const t = sim.get("t")!;
    t.pos = vec3(0, 0, 0);
    t.using = true;
    for (let i = 0; i < Math.ceil(PLANT_TIME_SEC * TICK_RATE) + 1; i++) sim.updateBomb();
    expect(sim.bomb.planted).toBe(true);

    sim.tick = sim.bomb.plantedTick + BOMB_TIMER_SEC * TICK_RATE; // fast-forward
    sim.updateBomb();
    expect(sim.bomb.detonated).toBe(true);
  });
});

const cfg = { freezeTicks: 1, roundTicks: 5, endTicks: 1, roundsToWin: 5 };

describe("bomb win conditions (RoundManager)", () => {
  it("defused → CT wins", () => {
    const sim = armedSim();
    const rm = new RoundManager(sim, cfg);
    rm.update(); // → live
    sim.bomb.planted = true;
    sim.bomb.defused = true;
    rm.update();
    expect(rm.phase).toBe("ended");
    expect(rm.lastWinner).toBe("CT");
  });

  it("detonated → T wins", () => {
    const sim = armedSim();
    const rm = new RoundManager(sim, cfg);
    rm.update();
    sim.bomb.planted = true;
    sim.bomb.detonated = true;
    rm.update();
    expect(rm.phase).toBe("ended");
    expect(rm.lastWinner).toBe("T");
  });

  it("T wiped but bomb planted → round does NOT end (CT must defuse)", () => {
    const sim = armedSim();
    const rm = new RoundManager(sim, { ...cfg, roundTicks: 999 });
    rm.update(); // → live
    sim.bomb.planted = true;
    sim.get("t")!.alive = false; // all T dead
    rm.update();
    expect(rm.phase).toBe("live"); // bomb still ticking
  });
});
