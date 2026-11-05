import { expect, test, type Page } from '@playwright/test';

/** The daily reward calendar opens on the first visit of the day. */
async function claimDaily(page: Page): Promise<void> {
  const claim = page.locator('.login-modal [data-a="claim"]');
  await expect(claim).toBeVisible();
  await claim.click();
  await expect(page.locator('.login-modal')).toHaveCount(0);
}

/** A returning player (already served guests) starts on the café screen instead of in gameplay. */
async function asReturningPlayer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('cozy-cafe.save.v1')) {
      localStorage.setItem('cozy-cafe.save.v1', JSON.stringify({ version: 1, progress: { day: 2, coins: 40 }, meta: { stats: { served: 6 } } }));
    }
  });
}

/** Plays the rest of the day quickly (quick taps = lower quality) until the summary shows. */
async function finishDayQuickly(page: Page): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    await closeLevelUps(page);
    if (await page.locator('.summary-screen').count()) return;
    const serve = page.locator('#serve:not([disabled])');
    if (await serve.count()) {
      await serve.click();
      await page.waitForTimeout(300);
      continue;
    }
    const step = page.locator('.step.current');
    if (!(await step.count())) {
      await page.waitForTimeout(150);
      continue;
    }
    // the step can disappear right after count() (item finished): read it without waiting
    const id = await step.getAttribute('data-step', { timeout: 300 }).catch(() => null);
    const action = await step.getAttribute('data-action', { timeout: 300 }).catch(() => null);
    const btn = page.locator(`.ing[data-ing="${id}"]:not([disabled])`);
    if (!id || !(await btn.count())) {
      await page.waitForTimeout(120);
      continue;
    }
    await btn.click({ timeout: 2000 }).catch(() => undefined);
    if (action === 'timing') await page.locator('#work').click({ force: true });
    await page.waitForTimeout(120);
  }
}

/** Closes level-up chests that may open between guests. */
async function closeLevelUps(page: Page): Promise<void> {
  const ok = page.locator('.level-modal [data-a="ok"]');
  if (await ok.count()) await ok.click();
}

/** Waits until either the order can be served or the next ingredient button is usable. */
async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const serve = document.querySelector<HTMLButtonElement>('#serve');
    if (serve && !serve.disabled) return true;
    const cur = document.querySelector<HTMLElement>('.step.current');
    return !!cur && !!document.querySelector(`.ing[data-ing="${cur.dataset.step}"]:not([disabled])`);
  });
}

/** Prepares the current item step by step: tap, hold-to-pour until the green zone, or stop the machine in the green. */
async function prepareCurrentOrder(page: Page): Promise<void> {
  const serve = page.locator('#serve');
  for (let guard = 0; guard < 40; guard++) {
    await waitReady(page);
    if (await serve.isEnabled()) return;
    const step = page.locator('.step.current');
    await expect(step).toBeVisible();
    const id = (await step.getAttribute('data-step')) ?? '';
    const action = await step.getAttribute('data-action');
    const btn = page.locator(`.ing[data-ing="${id}"]`);
    await expect(btn).toBeEnabled();
    const inZone = () => {
      const g = document.querySelector<HTMLElement>('#gauge');
      if (!g) return false;
      const l = Number(g.dataset.level);
      return l >= (Number(g.dataset.lo) + Number(g.dataset.hi)) / 2;
    };
    if (action === 'tap') {
      await btn.click();
    } else if (action === 'timing') {
      await btn.click();
      await page.waitForFunction(inZone);
      await page.locator('#work').click({ force: true });
    } else {
      const box = await btn.boundingBox();
      if (!box) throw new Error('no button box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction(inZone);
      await page.mouse.up();
    }
  }
}

test.describe('Cozy Café smoke (390px)', () => {
  test('new player lands directly in gameplay, serves the first customer correctly, coins increase', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const external: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(r.url());
    });

    await page.goto('/?seed=12345');
    // CrazyGames: new users land in gameplay immediately (no menu, no popup)
    await expect(page.locator('.play-screen')).toBeVisible();
    await expect(page.locator('.login-modal')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    const start = Number(await page.locator('#coin-count').textContent());
    await expect(page.locator('#bubble .order-item')).toHaveCount(1);
    await expect(page.locator('#bubble')).not.toHaveClass(/hidden/);
    // first time: a hand shows what to do
    await expect(page.locator('#hand')).not.toHaveClass(/hidden/);

    // no rewarded-video button on the gameplay screen
    await expect(page.locator('.play-screen [data-a="x2"], #redo-ad, .redo-row')).toHaveCount(0);

    // a wrong ingredient is only a gentle "oops"
    const first = await page.locator('.step.current').getAttribute('data-step');
    const wrong = page.locator(`.ing:not([data-ing="${first}"])`).first();
    await wrong.click();
    await expect(page.locator('.oops-bubble')).toBeVisible();

    await prepareCurrentOrder(page);
    await expect(page.locator('#serve')).toBeEnabled();
    await page.locator('#serve').click();

    // released in the green zone every time → 3 stars, happy guest
    await expect(page.locator('.pay-pop')).toHaveAttribute('data-stars', '3');
    await expect(page.locator('#guest')).toHaveAttribute('data-stars', '3');
    await expect.poll(async () => Number(await page.locator('#coin-count').textContent()), { timeout: 5000 }).toBeGreaterThan(start + 3);

    // next customer arrives with a different order; no game over
    await expect(page.locator('#dots i.done')).toHaveCount(1, { timeout: 8000 });
    await closeLevelUps(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    // progress is saved; a returning player gets the café screen and today's reward
    const coins = Number(await page.locator('#coin-count').textContent());
    await page.reload();
    await claimDaily(page);
    await expect(page.locator('.missions .mission')).toHaveCount(3);
    expect(Number(await page.locator('#coin-count').textContent())).toBeGreaterThan(coins);

    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('releasing far from the green zone still pays; the 3★ upgrade is offered on the summary', async ({ page }) => {
    await page.goto('/?seed=777');
    await expect(page.locator('#bubble')).not.toHaveClass(/hidden/);
    for (let guard = 0; guard < 40; guard++) {
      await waitReady(page);
      if (await page.locator('#serve').isEnabled()) break;
      const step = page.locator('.step.current');
      const id = (await step.getAttribute('data-step')) ?? '';
      const action = await step.getAttribute('data-action');
      const btn = page.locator(`.ing[data-ing="${id}"]`);
      await expect(btn).toBeEnabled();
      if (action === 'timing') {
        await btn.click();
        await page.locator('#work').click({ force: true }); // stopped far too early
      } else await btn.click(); // a quick tap instead of holding
    }
    const before = Number(await page.locator('#coin-count').textContent());
    await page.locator('#serve').click();
    await expect.poll(async () => Number(await page.locator('#coin-count').textContent()), { timeout: 5000 }).toBeGreaterThan(before);
    const stars = Number(await page.locator('#guest').getAttribute('data-stars'));
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(stars).toBeLessThan(3);
    await expect(page.locator('#redo-ad, .redo-row')).toHaveCount(0); // never during gameplay

    await finishDayQuickly(page);
    await expect(page.locator('.summary-screen')).toBeVisible();
    await closeLevelUps(page);
    // optional video (granted directly without the SDK), with a gem alternative of the same look
    const redo = page.locator('#redo-video');
    await expect(redo).toBeVisible();
    await expect(page.locator('#redo-gems')).toBeVisible();
    const coins = Number(await page.locator('#coin-count').textContent());
    await redo.click();
    await expect.poll(async () => Number(await page.locator('#coin-count').textContent())).toBeGreaterThan(coins);
    // next day (the midgame-ad slot) starts gameplay again
    await page.locator('#next').click();
    await expect(page.locator('.play-screen')).toBeVisible();
  });

  test('language can be switched to French and is remembered', async ({ page }) => {
    await asReturningPlayer(page);
    await page.goto('/');
    await claimDaily(page);
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('button', { name: /Ouvrir le café/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Ouvrir le café/ })).toBeVisible();
  });

  test('shop opens with recipes, equipment, decor and café expansions', async ({ page }) => {
    await asReturningPlayer(page);
    await page.goto('/');
    await claimDaily(page);
    await page.locator('#shop').click();
    await expect(page.locator('.card')).toHaveCount(14);
    await page.locator('[data-tab="decor"]').click();
    await expect(page.locator('.decor-preview')).toBeVisible();
    await page.locator('[data-tab="cafe"]').click();
    await expect(page.locator('[data-expansion]')).toHaveCount(11);
    await page.locator('#back').click();
    await expect(page.locator('#play')).toBeVisible();
  });

  test('gift box (×2 with video), sticker book and achievements', async ({ page }) => {
    await asReturningPlayer(page);
    await page.goto('/');
    await claimDaily(page);
    const before = Number(await page.locator('#coin-count').textContent());
    await page.locator('#gift').click();
    await page.locator('.gift-modal [data-a="x2"]').click();
    await expect.poll(async () => Number(await page.locator('#coin-count').textContent())).toBeGreaterThan(before);
    await expect(page.locator('#gift')).not.toHaveClass(/ready/); // next one in 15 minutes
    await page.locator('#book').click();
    await expect(page.locator('[data-sticker]')).toHaveCount(11);
    await page.locator('[data-book="achievements"]').click();
    await expect(page.locator('[data-achievement]').first()).toBeVisible();
    await page.locator('#back').click();
    await expect(page.locator('#play')).toBeVisible();
  });

  test('16:9 iframe sizes: everything fits without scrolling, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    for (const [width, height] of [
      [907, 510],
      [800, 450],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/?seed=5');
      await expect(page.locator('.play-screen')).toBeVisible();
      const fits = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth);
      expect(fits, `${width}x${height}`).toBe(true);
      // café and station side by side
      const scene = await page.locator('#scene').boundingBox();
      const station = await page.locator('#station').boundingBox();
      expect(station!.x).toBeGreaterThan(scene!.x + scene!.width - 1);
      await page.evaluate(() => localStorage.clear());
    }
    expect(errors).toEqual([]);
  });
});
