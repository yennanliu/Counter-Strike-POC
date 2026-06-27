import { describe, it, expect } from "vitest";
import {
  MapRegistry,
  arenaFromManifest,
  GameSimulation,
  RoundManager,
} from "@cs/server";

/**
 * P4 exit criterion — a room can be created on EACH of the 5 fields and run a
 * full round cycle. Pure/deterministic (no sockets): for every map we build the
 * sim + round FSM, verify players spawn at that map's points, and drive
 * freeze → live → ended → next round.
 */
describe("round cycle runs on each of the 5 fields", () => {
  it("freeze → live → (elimination) ended → next round, on every map", () => {
    const reg = new MapRegistry();
    const maps = reg.list();
    expect(maps).toHaveLength(5);

    for (const m of maps) {
      const sim = new GameSimulation(arenaFromManifest(m));
      sim.addPlayer("ct"); // idx 0 → CT
      sim.addPlayer("t"); // idx 1 → T

      const rounds = new RoundManager(sim, {
        freezeTicks: 2,
        roundTicks: 50,
        endTicks: 2,
        roundsToWin: 5,
      });

      // Freeze: firing disabled, players sitting on this map's spawns.
      expect(rounds.phase, `${m.id} starts in freeze`).toBe("freeze");
      expect(sim.firingEnabled).toBe(false);
      expect(m.spawns.CT).toContainEqual(sim.get("ct")!.pos);
      expect(m.spawns.T).toContainEqual(sim.get("t")!.pos);

      // Advance to live.
      while (rounds.phase === "freeze") rounds.update();
      expect(rounds.phase, `${m.id} goes live`).toBe("live");
      expect(sim.firingEnabled).toBe(true);

      // Eliminate T → round ends, CT scores.
      sim.get("t")!.alive = false;
      rounds.update();
      expect(rounds.phase, `${m.id} round ends`).toBe("ended");
      expect(rounds.scores.CT).toBe(1);

      // Roll into the next round; players respawn.
      while (rounds.phase === "ended") rounds.update();
      expect(rounds.phase, `${m.id} next round`).toBe("freeze");
      expect(rounds.round).toBe(2);
      expect(sim.get("t")!.alive).toBe(true);
    }
  });
});
