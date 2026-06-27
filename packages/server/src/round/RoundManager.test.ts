import { describe, it, expect } from "vitest";
import { RoundManager, type RoundConfig } from "./RoundManager.js";
import { GameSimulation, type Arena } from "../sim/GameSimulation.js";
import { vec3 } from "@cs/shared";

const arena: Arena = {
  spawnsT: [vec3(0, 0, 0)],
  spawnsCT: [vec3(0, 0, 10)],
  colliders: [],
};

/** Sim with one CT (idx0) and one T (idx1). */
function simWithTeams() {
  const sim = new GameSimulation(arena);
  sim.addPlayer("ct"); // idx 0 → CT
  sim.addPlayer("t"); // idx 1 → T
  return sim;
}

const cfg = (over: Partial<RoundConfig>): RoundConfig => ({
  freezeTicks: 2,
  roundTicks: 3,
  endTicks: 2,
  roundsToWin: 5,
  ...over,
});

describe("RoundManager — T-060: round state machine", () => {
  it("starts in freeze with firing disabled", () => {
    const sim = simWithTeams();
    const rm = new RoundManager(sim, cfg({}));
    expect(rm.phase).toBe("freeze");
    expect(sim.firingEnabled).toBe(false);
  });

  it("freeze → live after freezeTicks, enabling firing", () => {
    const sim = simWithTeams();
    const rm = new RoundManager(sim, cfg({ freezeTicks: 2 }));
    rm.update();
    expect(rm.phase).toBe("freeze");
    rm.update(); // 2nd tick reaches freezeTicks
    expect(rm.phase).toBe("live");
    expect(sim.firingEnabled).toBe(true);
  });

  it("live → ended on timer expiry (CT defends), disabling firing", () => {
    const sim = simWithTeams();
    const rm = new RoundManager(sim, cfg({ freezeTicks: 1, roundTicks: 3 }));
    rm.update(); // → live
    expect(rm.phase).toBe("live");
    rm.update();
    rm.update();
    rm.update(); // 3 live ticks → timer
    expect(rm.phase).toBe("ended");
    expect(rm.lastWinner).toBe("CT");
    expect(rm.scores.CT).toBe(1);
    expect(sim.firingEnabled).toBe(false);
  });

  it("live → ended immediately when a team is eliminated", () => {
    const sim = simWithTeams();
    const rm = new RoundManager(sim, cfg({ freezeTicks: 1, roundTicks: 999 }));
    rm.update(); // → live
    sim.get("t")!.alive = false; // T wiped out
    rm.update();
    expect(rm.phase).toBe("ended");
    expect(rm.lastWinner).toBe("CT");
    expect(rm.scores.CT).toBe(1);
  });

  it("does not end a round just because an empty team has 0 alive", () => {
    const sim = new GameSimulation(arena);
    sim.addPlayer("ct"); // only a CT player exists
    const rm = new RoundManager(sim, cfg({ freezeTicks: 1, roundTicks: 5 }));
    rm.update(); // → live
    rm.update(); // T has 0 players (not 0 survivors) → no instant win
    expect(rm.phase).toBe("live");
  });

  it("advances to the next round after the ended phase and respawns players", () => {
    const sim = simWithTeams();
    const rm = new RoundManager(sim, cfg({ freezeTicks: 1, roundTicks: 999, endTicks: 1 }));
    rm.update(); // → live
    sim.get("t")!.alive = false;
    rm.update(); // → ended (CT wins)
    expect(rm.phase).toBe("ended");
    rm.update(); // endTicks reached → next round
    expect(rm.phase).toBe("freeze");
    expect(rm.round).toBe(2);
    expect(sim.get("t")!.alive).toBe(true); // respawned
  });

  it("ends the match when a team reaches roundsToWin", () => {
    const sim = simWithTeams();
    const rm = new RoundManager(
      sim,
      cfg({ freezeTicks: 1, roundTicks: 999, endTicks: 1, roundsToWin: 2 }),
    );
    for (let i = 0; i < 50 && rm.phase !== "matchOver"; i++) {
      if (rm.phase === "live") sim.get("t")!.alive = false; // CT keeps winning
      rm.update();
    }
    expect(rm.phase).toBe("matchOver");
    expect(rm.scores.CT).toBe(2);
    expect(sim.firingEnabled).toBe(false);
  });
});
