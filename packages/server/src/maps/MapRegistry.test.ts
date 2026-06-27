import { describe, it, expect } from "vitest";
import { MapRegistry, validateManifest, arenaFromManifest } from "./MapRegistry.js";
import { GameSimulation } from "../sim/GameSimulation.js";

const EXPECTED_IDS = ["arena", "dust-lite", "warehouse", "office", "bridge"].sort();

describe("MapRegistry — T-061: the 5 fields load and validate", () => {
  it("loads exactly the 5 expected maps", () => {
    const reg = new MapRegistry();
    expect(reg.list().map((m) => m.id).sort()).toEqual(EXPECTED_IDS);
  });

  it("every map has a name, bounds, and non-empty T & CT spawns", () => {
    for (const m of new MapRegistry().list()) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.bounds.min).toBeDefined();
      expect(m.bounds.max).toBeDefined();
      expect(m.spawns.T.length).toBeGreaterThan(0);
      expect(m.spawns.CT.length).toBeGreaterThan(0);
    }
  });

  it("get() resolves a known id and returns undefined otherwise", () => {
    const reg = new MapRegistry();
    expect(reg.get("arena")?.id).toBe("arena");
    expect(reg.has("dust-lite")).toBe(true);
    expect(reg.get("nope")).toBeUndefined();
  });
});

describe("validateManifest", () => {
  const good = {
    id: "x",
    version: 1,
    name: "X",
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    spawns: { T: [{ x: 0, y: 0, z: 0 }], CT: [{ x: 1, y: 0, z: 1 }] },
    colliders: [],
  };

  it("accepts a well-formed manifest", () => {
    expect(validateManifest(good).id).toBe("x");
  });

  it("rejects a manifest missing a team's spawns", () => {
    expect(() => validateManifest({ ...good, spawns: { T: [], CT: [] } })).toThrow();
  });

  it("rejects a non-object", () => {
    expect(() => validateManifest(null)).toThrow();
  });
});

describe("arenaFromManifest + GameSimulation", () => {
  it("spawns players only at the chosen map's spawn points", () => {
    const reg = new MapRegistry();
    const office = reg.get("office")!;
    const sim = new GameSimulation(arenaFromManifest(office));
    const a = sim.addPlayer("a"); // CT
    const b = sim.addPlayer("b"); // T
    expect(office.spawns.CT).toContainEqual(a.pos);
    expect(office.spawns.T).toContainEqual(b.pos);
  });
});
