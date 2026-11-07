import { expect, test } from '@playwright/test';

/**
 * Smoke: load a sample portfolio, see a concentration flag, change a fee assumption and watch
 * the sensitivity grid update, then round-trip the portfolio through a share link.
 * Works in seed-only mode (no API keys).
 */
test('sample portfolio -> flags -> fee grid -> share link round-trip', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  // First-time visitor sees sample portfolios front and centre.
  const sample = page.getByRole('button', { name: /Three S&P 500 funds/ }).first();
  await expect(sample).toBeVisible();
  await sample.click();

  // Loading a sample jumps to the Concentration tab.
  await expect(page.getByRole('tab', { name: /Concentration/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('naive-sentence')).toContainText('You own');

  // Make sure at least one heuristic fires regardless of the seed snapshot: a 5% single-name threshold.
  const nameThreshold = page.getByLabel('Single name above');
  await nameThreshold.fill('5');
  const flags = page.getByTestId('flags-list');
  await expect(flags).toBeVisible();
  await expect(flags.getByRole('listitem').first()).toContainText('%');

  // Fees: the sensitivity grid is the default view and reacts to the fee assumption.
  await page.getByRole('tab', { name: 'Fees' }).click();
  const cell = page.getByTestId('grid-0.07-30');
  await expect(cell).toBeVisible();
  await expect(cell).not.toHaveText('n/a');
  const before = (await cell.textContent()) ?? '';
  await page.getByLabel('All-in annual fee').fill('1.5');
  await expect(cell).not.toHaveText(before);
  await expect(page.getByText('Hypothetical illustration, not a forecast').first()).toBeVisible();

  // Share: the link carries tickers and weights only.
  await page.getByRole('tab', { name: 'Portfolio' }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const url = await page.getByTestId('share-url').inputValue();
  expect(url).toContain('#p=');
  expect(url).not.toMatch(/30000|25000|15000/);

  // Open the link in a fresh context (empty localStorage) and get the same securities back.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(url);
  await expect(other.getByRole('status').filter({ hasText: 'Loaded a shared portfolio' })).toBeVisible();
  await expect(other.getByText('$100,000 notional').first()).toBeVisible();
  for (const sym of ['SPY', 'VOO', 'IVV', 'QQQ', 'VGT', 'AAPL']) {
    await expect(other.getByRole('table', { name: 'Positions' }).getByText(sym, { exact: true })).toBeVisible();
  }
  await fresh.close();
});
