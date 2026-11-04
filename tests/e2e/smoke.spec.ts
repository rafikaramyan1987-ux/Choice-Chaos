import { expect, test } from '@playwright/test';

test.describe('Choice Chaos smoke (390px)', () => {
  test('plays a full run to an ending', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const external: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.protocol.startsWith('data') && !url.protocol.startsWith('blob')) {
        external.push(r.url());
      }
    });

    await page.goto('/?seed=12345');
    await expect(page.getByRole('button', { name: /Play|Jouer/ })).toBeVisible();
    // No horizontal overflow at 390px
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await page.getByRole('button', { name: /Play|Jouer/ }).click();
    await expect(page.locator('#card')).toBeVisible();
    await expect(page.locator('.meter')).toHaveCount(4);

    let ended = false;
    for (let i = 0; i < 40 && !ended; i++) {
      if (await page.locator('.ending-screen').isVisible()) { ended = true; break; }
      const choices = page.locator('button.choice');
      await expect(choices.first()).toBeVisible();
      // alternate tap / keyboard / swipe so every input path is exercised
      if (i % 3 === 0) await choices.nth(i % (await choices.count())).click();
      else if (i % 3 === 1) await page.keyboard.press('1');
      else {
        const box = await page.locator('#card').boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 6 });
          await page.mouse.up();
        }
      }
      await page.waitForTimeout(350);
      ended = await page.locator('.ending-screen').isVisible();
    }
    expect(ended).toBe(true);
    await expect(page.locator('.ending-title')).not.toBeEmpty();
    await expect(page.locator('#card-canvas')).toBeVisible();
    const cardWidth = await page.locator('#card-canvas').evaluate((c: HTMLCanvasElement) => c.width);
    expect(cardWidth).toBe(1080);

    // Endings collection now shows at least one found ending
    await page.getByRole('button', { name: /Menu/ }).last().click();
    await page.getByRole('button', { name: /Endings|Fins/ }).click();
    await expect(page.locator('.ending-item:not(.locked)')).toHaveCount(1);

    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('situation of the day can be answered once', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Situation/ }).click();
    const choices = page.locator('button.choice');
    await choices.first().click();
    await expect(page.locator('button.choice').first()).toBeDisabled();
    // no fake "x % of players" numbers
    await expect(page.locator('#choice-stats')).toBeEmpty();
  });

  test('language can be switched to French', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('button', { name: /Jouer/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Jouer/ })).toBeVisible();
  });
});
