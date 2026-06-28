import { test, expect, chromium, type Page } from "@playwright/test";

/**
 * T-081 — two browsers join the same field and each sees the other move.
 * Uses the in-page __cs test hook (exposed by app.ts) to read connected players
 * and their authoritative positions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CsHook = { sessionId: string; ids: () => string[]; player: (id: string) => { x: number; y: number; z: number } | null };
declare global {
  interface Window {
    __cs?: CsHook;
  }
}

async function joinArena(page: Page): Promise<void> {
  await page.goto("/");
  await page.click('button[data-map="arena"]'); // game-center field card
  await page.waitForFunction(() => (window.__cs?.ids().length ?? 0) >= 1, undefined, {
    timeout: 20_000,
  });
}

test("two players join the same room and see each other move", async () => {
  const browser1 = await chromium.launch();
  const browser2 = await chromium.launch();
  const p1 = await browser1.newPage();
  const p2 = await browser2.newPage();

  try {
    await joinArena(p1);
    await joinArena(p2);

    // Both clients converge on a 2-player room.
    for (const p of [p1, p2]) {
      await p.waitForFunction(() => window.__cs!.ids().length === 2, undefined, {
        timeout: 20_000,
      });
    }

    const id1 = await p1.evaluate(() => window.__cs!.sessionId);

    // p2 must have a position for p1 before we measure.
    await p2.waitForFunction((id) => window.__cs!.player(id) !== null, id1);
    const before = await p2.evaluate((id) => window.__cs!.player(id)!, id1);

    // p1 walks forward; p2 should observe p1's avatar move.
    await p1.keyboard.down("KeyW");
    await p2.waitForFunction(
      ({ id, bx, bz }) => {
        const pos = window.__cs!.player(id);
        return !!pos && Math.hypot(pos.x - bx, pos.z - bz) > 0.5;
      },
      { id: id1, bx: before.x, bz: before.z },
      { timeout: 15_000 },
    );
    await p1.keyboard.up("KeyW");

    const after = await p2.evaluate((id) => window.__cs!.player(id)!, id1);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.5);
  } finally {
    await browser1.close();
    await browser2.close();
  }
});
