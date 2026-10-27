import { expect, test } from '@playwright/test';

const ROUTES = ['#/', '#/play', '#/results'];

for (const width of [360, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal page overflow`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('main')).toBeVisible();
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0);
      });
    }
  });
}
