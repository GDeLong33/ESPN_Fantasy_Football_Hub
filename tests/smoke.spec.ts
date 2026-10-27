import { expect, test, type Page } from '@playwright/test';

const ROUTES = ['#/', '#/play', '#/play/lock-in', '#/results'];

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0);
}

for (const width of [360, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal page overflow`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('main')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoOverflow(page);
      });
    }
  });
}

test.describe('draft room', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('builds a full lineup from the waiver wire', async ({ page }) => {
    await page.goto('#/play');
    const lineup = page.getByRole('region', { name: 'Your lineup' }).or(page.locator('section.lineup'));
    await expect(lineup.getByText(/0 of \d+ filled/)).toBeVisible();

    // Fill every empty slot: "Pick a X" filters the wire, then take the top available player.
    for (let i = 0; i < 20; i++) {
      const empty = lineup.getByRole('button', { name: /^Pick a / }).first();
      if ((await empty.count()) === 0) break;
      await empty.click();
      await page.locator('.wire').getByRole('button', { name: /^Add / }).first().click();
    }

    await expect(lineup.getByText(/(\d+) of \1 filled/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lock in my lineup' })).toBeVisible();
    await expect(page.locator('.bars__row--you')).toHaveCount(1);
    await expectNoOverflow(page);

    // The lineup survives the trip to the lock-in page.
    await page.getByRole('link', { name: 'Lock in my lineup' }).click();
    await expect(page.getByRole('heading', { name: 'Lock in your lineup' })).toBeVisible();
    await expect(page.locator('.summary').getByText('Empty slot')).toHaveCount(0);
  });

  test('FLEX never offers a QB once QB is filled', async ({ page }) => {
    await page.goto('#/play');
    await page.locator('section.lineup').getByRole('button', { name: 'Pick a QB' }).click();
    await page.locator('.wire').getByRole('button', { name: /^Add / }).first().click();
    await expect(page.locator('.wire').getByRole('button', { name: 'No open QB slot' }).first()).toBeDisabled();
  });
});
