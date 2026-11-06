import { expect, test } from '@playwright/test';

interface Hook {
  duel: { phase: string; turn: number; turnNumber: number; fighters: Array<{ shots: number; hp: number }>; projectiles: unknown[] } | null;
}
const state = () => {
  const app = (window as unknown as { __stickDuel: Hook }).__stickDuel;
  const d = app.duel;
  return d ? { phase: d.phase, turn: d.turn, turns: d.turnNumber, shots: d.fighters[0]!.shots, enemyHp: d.fighters[1]!.hp, flying: d.projectiles.length } : null;
};

test('loads, starts level 1 and fires a shot by dragging', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith('http://localhost') && !url.startsWith('data:')) errors.push(`external request: ${url}`);
  });

  await page.goto('/');
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('.logo')).toContainText('Stick');
  await page.locator('#play').click();
  await page.locator('.node[data-level="1"]').click();
  await expect(page.locator('#fight')).toBeVisible();
  await page.locator('#fight').click();
  await expect(page.locator('.hud')).toBeVisible();
  await page.waitForFunction(() => {
    const d = (window as unknown as { __stickDuel: Hook }).__stickDuel.duel;
    return d?.phase === 'aim' && d.turn === 0;
  });

  // drag back (down-left) and release: shoots up and to the right
  const vp = page.viewportSize()!;
  const x0 = vp.width * 0.5;
  const y0 = vp.height * 0.55;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 - i * 12, y0 + i * 9);
  await page.mouse.up();

  await page.waitForFunction(() => {
    const d = (window as unknown as { __stickDuel: Hook }).__stickDuel.duel;
    return !!d && d.fighters[0]!.shots === 1;
  });
  const s1 = await page.evaluate(state);
  expect(s1?.shots).toBe(1);
  // the shot resolves and the turn passes to the enemy (or the enemy is hit)
  await page.waitForFunction(() => {
    const d = (window as unknown as { __stickDuel: Hook }).__stickDuel.duel;
    return !!d && (d.turn === 1 || d.phase === 'over');
  }, null, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('every screen opens: map, shop, settings, 2 players, endless', async ({ page }) => {
  await page.goto('/');
  await page.locator('#shop').click();
  await expect(page.locator('.shopgrid .item')).toHaveCount(6);
  await page.locator('.topbar .btn').first().click();
  await page.locator('#settings').click();
  await page.locator('[data-lang="fr"]').click();
  await expect(page.locator('.settings h2')).toHaveText('Réglages');
  await page.locator('[data-lang="en"]').click();
  await page.locator('.topbar .btn').first().click();
  await page.locator('#versus').click();
  await page.locator('[data-world="3"]').click();
  await page.locator('#versus-start').click();
  await page.locator('#fight').click();
  await expect(page.locator('.hud .hp.s1 .name')).toHaveText('P2');
  await page.locator('#pause').click();
  await page.locator('.pausecard .btn').last().click();
  await page.locator('#endless').click();
  await page.locator('#endless-start').click();
  await expect(page.locator('#fight')).toBeVisible();
});
