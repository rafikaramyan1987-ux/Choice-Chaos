import { expect, test } from '@playwright/test';

test.describe('Cozy Café smoke (390px)', () => {
  test('start the game, serve the first customer correctly, coins increase', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const external: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(r.url());
    });

    await page.goto('/?seed=12345');
    await expect(page.getByRole('button', { name: /Open the café|Ouvrir le café/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.locator('#coin-count')).toHaveText('0');

    await page.locator('#play').click();
    // day 1: one simple recipe, shown as pictures
    await expect(page.locator('#bubble .order-item')).toHaveCount(1);
    await expect(page.locator('#bubble')).not.toHaveClass(/hidden/);

    // a wrong ingredient is only a gentle "oops"
    await page.locator('[data-ing="milk"]').click();
    await expect(page.locator('.oops-bubble')).toBeVisible();

    for (const ing of ['cup', 'coffee', 'milk', 'foam']) {
      await expect(page.locator(`.step.current[data-step="${ing}"]`)).toBeVisible();
      await page.locator(`[data-ing="${ing}"]`).click();
    }
    const serve = page.locator('#serve');
    await expect(serve).toBeEnabled();
    await serve.click();

    await expect(page.locator('.pay-pop')).toBeVisible();
    await expect.poll(async () => Number(await page.locator('#coin-count').textContent()), { timeout: 5000 }).toBeGreaterThan(6);
    // next customer arrives; no game over
    await expect(page.locator('#dots i.done')).toHaveCount(1, { timeout: 5000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    // progress is saved
    await page.reload();
    expect(Number(await page.locator('#coin-count').textContent())).toBeGreaterThan(6);

    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('language can be switched to French and is remembered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('button', { name: /Ouvrir le café/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Ouvrir le café/ })).toBeVisible();
  });

  test('shop opens with recipes, equipment and decor', async ({ page }) => {
    await page.goto('/');
    await page.locator('#shop').click();
    await expect(page.locator('.card')).toHaveCount(13);
    await page.locator('[data-tab="decor"]').click();
    await expect(page.locator('.decor-preview')).toBeVisible();
    await page.locator('#back').click();
    await expect(page.locator('#play')).toBeVisible();
  });
});
