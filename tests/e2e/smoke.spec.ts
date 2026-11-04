import { expect, test, type Page } from '@playwright/test';

/** The daily reward calendar opens on the first visit of the day. */
async function claimDaily(page: Page): Promise<void> {
  const claim = page.locator('.login-modal [data-a="claim"]');
  await expect(claim).toBeVisible();
  await claim.click();
  await expect(page.locator('.login-modal')).toHaveCount(0);
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
  test('start, serve the first customer correctly (hold to pour in the green), coins increase', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const external: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(r.url());
    });

    await page.goto('/?seed=12345');
    await claimDaily(page);
    await expect(page.getByRole('button', { name: /Open the café|Ouvrir le café/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    // 3 missions with progress bars on the café screen
    await expect(page.locator('.missions .mission')).toHaveCount(3);
    const start = Number(await page.locator('#coin-count').textContent());
    expect(start).toBeGreaterThan(0); // daily reward

    await page.locator('#play').click();
    await expect(page.locator('#bubble .order-item')).toHaveCount(1);
    await expect(page.locator('#bubble')).not.toHaveClass(/hidden/);
    // first time: a hand shows what to do
    await expect(page.locator('#hand')).not.toHaveClass(/hidden/);

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

    // progress is saved
    const coins = Number(await page.locator('#coin-count').textContent());
    await page.reload();
    await expect(page.locator('.login-modal')).toHaveCount(0); // already claimed today
    await expect(page.locator('#coin-count')).toHaveText(String(coins));

    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('releasing far from the green zone still pays (fewer stars, never angry)', async ({ page }) => {
    await page.goto('/?seed=777');
    await claimDaily(page);
    await page.locator('#play').click();
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
    if (stars < 3) {
      // optional rewarded video to make it 3★ (granted directly without the SDK)
      await page.locator('#redo-ad').click();
      await expect(page.locator('#guest')).toHaveAttribute('data-stars', '3');
    }
  });

  test('language can be switched to French and is remembered', async ({ page }) => {
    await page.goto('/');
    await claimDaily(page);
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('button', { name: /Ouvrir le café/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Ouvrir le café/ })).toBeVisible();
  });

  test('shop opens with recipes, equipment, decor and café expansions', async ({ page }) => {
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
});
