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

test.describe('lock in', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function draftFullLineup(page: Page) {
    await page.goto('#/play');
    const lineup = page.locator('section.lineup');
    await expect(lineup.getByText(/0 of \d+ filled/)).toBeVisible();
    for (let i = 0; i < 20; i++) {
      const empty = lineup.getByRole('button', { name: /^Pick a / }).first();
      if ((await empty.count()) === 0) break;
      await empty.click();
      await page.locator('.wire').getByRole('button', { name: /^Add / }).first().click();
    }
    await page.getByRole('link', { name: 'Lock in my lineup' }).click();
  }

  test('requires a name and confirmation, then submits', async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('https://fake.supabase.test/rest/v1/entries*', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 201, body: '' });
    });
    await draftFullLineup(page);

    await page.getByRole('button', { name: 'Lock it in' }).click();
    await expect(page.getByText('Enter a name between 2 and 40 characters.')).toBeVisible();
    await expect(page.getByText('Tick the box to confirm.')).toBeVisible();
    expect(body).toBeNull();

    await page.getByLabel('Your name').fill('  Test   Player ');
    await page.getByLabel('Team name (optional)').fill('Waiver Kings');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Lock it in' }).click();

    await expect(page.getByRole('heading', { name: "You're in, Test Player." })).toBeVisible();
    expect(body).toMatchObject({ season: 2026, name: '  Test   Player ', team_name: 'Waiver Kings' });
    expect((body!.lineup as unknown[]).length).toBe(9);
    await expectNoOverflow(page);
  });

  test('shows a friendly message for a duplicate name', async ({ page }) => {
    await page.route('https://fake.supabase.test/rest/v1/entries*', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }),
      }),
    );
    await draftFullLineup(page);
    await page.getByLabel('Your name').fill('Gavin');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Lock it in' }).click();
    await expect(page.getByRole('alert')).toContainText('Someone already entered as "Gavin" this week.');
  });
});

test.describe('week board', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('lists entries with projections, highlights Austin and your entry', async ({ page }) => {
    const meta = await (await page.request.get('data/meta.json')).json();
    const austin = await (await page.request.get('data/austin.json')).json();
    const pool = await (await page.request.get('data/freeagents.json')).json();
    const ids = pool.players.slice(0, 3).map((p: { id: number }) => p.id);

    await page.addInitScript(
      ([season, week, lineup]) =>
        localStorage.setItem(`cyba:entered:${season}:${week}`, JSON.stringify({ name: 'Test Player', teamName: 'Waiver Kings', lineup })),
      [meta.season, meta.week, ids] as const,
    );
    await page.route('https://fake.supabase.test/rest/v1/rpc/entry_board*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { entry_id: 'a', name: 'Test Player', team_name: 'Waiver Kings', created_at: '2026-10-28T00:00:00Z', proj_total: austin.projTotal + 5, lineup: null },
          {
            entry_id: 'b',
            name: 'Someone Else',
            team_name: null,
            created_at: '2026-10-28T00:00:00Z',
            proj_total: austin.projTotal - 10,
            lineup: [{ slot: 'QB', playerId: 1, name: 'Friend QB', pos: 'QB', team: 'CLE', proj: 13 }],
          },
        ]),
      }),
    );

    await page.goto('#/results');
    await expect(page.getByRole('heading', { name: 'The board' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your entry' })).toBeVisible();
    const board = page.locator('ol.board');
    await expect(board.locator('.board__row')).toHaveCount(2);
    await expect(board.locator('.is-mine')).toContainText('Ahead of Austin');
    await expect(board.locator('.board__row').nth(1)).toContainText('Behind Austin');
    await expect(page.locator('.bars__row--austin')).toContainText('(Austin)');
    await expect(page.locator('.bars__row--you')).toHaveCount(1);
    await expect(page.locator('.bars__row--entry')).toHaveCount(1);

    // A friend's lineup opens with a tap, before kickoff.
    await expect(page.getByText('Friend QB')).toBeHidden();
    await board.locator('.board__row').nth(1).locator('summary').click();
    await expect(page.getByText('Friend QB')).toBeVisible();
    await expectNoOverflow(page);
  });
});
