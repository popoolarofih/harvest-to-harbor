import { expect, test, type Page } from '@playwright/test';
import { busyFarm } from '../game/fixtures';
import { serializeSave } from '../game/save';
import { advanceDay } from '../game/simulation';

// Critical journeys through the real UI of the production build. Each test gets a fresh browser
// context, so localStorage starts empty unless the test seeds it.

const SAVE_KEY = 'h2h.save';
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
const tutorialCard = (page: Page) => page.getByTestId('tutorial-card');
const savedGame = (page: Page) => page.evaluate(k => { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; }, SAVE_KEY);

/** Title → New Season → intro → tutorial choice → dismiss Baba's opening story. */
async function startSeason(page: Page, tutorial: boolean) {
  await page.goto('/');
  await button(page, /Start New Season/).click();
  await expect(page.getByRole('dialog', { name: 'Story introduction' })).toBeVisible();
  await button(page, 'Skip intro').click();
  await button(page, tutorial ? /Start with a short tutorial/ : /Skip the tutorial/).click();
  await button(page, 'Got it').click();
}

async function endDay(page: Page) {
  const day = Number(await page.locator('.stat', { hasText: 'Day' }).locator('b').innerText());
  await page.locator('[data-tut=end-day]').click();
  await expect(page.locator('.stat', { hasText: 'Day' }).locator('b')).toHaveText(String(day + 1));
  const report = button(page, 'Start the day');
  if (await report.isVisible()) await report.click();
}

test('first-time player: title, story intro, tutorial, autosave', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nigeria' })).toBeVisible();
  await expect(page.getByText('Start with two hectares of ginger farmland.')).toBeVisible();
  await expect(button(page, /Continue Farming/)).toHaveCount(0);

  await button(page, /Start New Season/).click();
  // Short story cards, one at a time.
  await expect(page.getByRole('heading', { name: 'Two hectares of your own' })).toBeVisible();
  await button(page, 'Next').click();
  await expect(page.getByRole('heading', { name: /₦500,000/ })).toBeVisible();
  await button(page, 'Next').click();
  await expect(page.getByText('Baba Musa', { exact: true })).toBeVisible();
  await button(page, 'Skip intro').click();
  await button(page, /Start with a short tutorial/).click();
  await button(page, 'Got it').click();

  await expect(tutorialCard(page)).toContainText('1 of 9');
  await expect(tutorialCard(page)).toContainText('Meet Baba Musa');
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  expect((await savedGame(page)).game.day).toBe(1);

  // Experienced players can skip ahead; a step only advances when its real action succeeds.
  // Nothing is planted, so after skipping "Plant ginger" the inspect and water steps don't apply and are passed over.
  for (let i = 0; i < 4; i++) await button(page, 'Skip step').click();
  await expect(tutorialCard(page)).toContainText('End the day');
  await expect(page.locator('[data-tut=end-day]')).toHaveCSS('box-shadow', /255, 210, 90/);
  await button(page, 'Storage').first().click(); // not the requested action
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(tutorialCard(page)).toContainText('End the day');
  await endDay(page);
  await expect(tutorialCard(page)).toContainText('Harvest when ready');
});

test('an unfinished tutorial resumes after a reload, and can be replayed from the Journal', async ({ page }) => {
  await startSeason(page, true);
  await button(page, 'Skip step').click();
  await button(page, 'Skip step').click();
  await expect(tutorialCard(page)).toContainText('3 of 9');
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);

  await page.reload();
  await button(page, /Continue Farming/).click();
  await expect(tutorialCard(page)).toContainText('3 of 9');
  await expect(tutorialCard(page)).toContainText('Prepare a plot');

  await button(page, 'End tutorial').click();
  await expect(tutorialCard(page)).toHaveCount(0);
  await button(page, 'Journal').click();
  await button(page, /Replay tutorial/).click();
  await expect(tutorialCard(page)).toContainText('1 of 9');
});

test('skipping the tutorial leaves the full game available', async ({ page }) => {
  await startSeason(page, false);
  await expect(tutorialCard(page)).toHaveCount(0);
  await expect(page.locator('.mission.campaign')).toContainText('The land');
  for (const tab of ['Storage', 'Market', 'Trade', 'Business', 'Journal']) {
    await page.locator('nav.bottom').getByRole('button', { name: tab }).click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
  }
});

test('returning player continues exactly where they left off; reloading advances nothing', async ({ page }) => {
  await startSeason(page, false);
  await endDay(page);
  await endDay(page);
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  const before = await savedGame(page);
  expect(before.game.day).toBe(3);

  for (let i = 0; i < 2; i++) {
    await page.reload();
    const cont = button(page, /Continue Farming/);
    await expect(cont).toContainText('Day 3');
    await cont.click();
    await expect(page.locator('.stat', { hasText: 'Day' }).locator('b')).toHaveText('3');
  }
  const after = await savedGame(page);
  expect(after.game.day).toBe(3);
  expect(after.game.cash).toBe(before.game.cash);
  expect(after.game.finance).toEqual(before.game.finance);
  expect(after.game.rng).toBe(before.game.rng);

  // Save & main menu goes back to the title with Continue available.
  await button(page, 'Menu').click();
  await button(page, /Save & main menu/).click();
  await expect(button(page, /Continue Farming/)).toContainText('Day 3');
});

test('starting a new season over a save asks first, and cancelling keeps the farm', async ({ page }) => {
  await startSeason(page, false);
  await endDay(page);
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  await page.reload();

  await button(page, /Start New Season/).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Start a new season?');
  await expect(dialog).toContainText('day 2');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(button(page, /Continue Farming/)).toContainText('Day 2');
  expect((await savedGame(page)).game.day).toBe(2);

  await button(page, /Start New Season/).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start new season' }).click();
  await expect(page.getByRole('dialog', { name: 'Story introduction' })).toBeVisible();
  expect((await savedGame(page)).game.day).toBe(1);
});

test('reset save from Settings deletes the farm after confirmation', async ({ page }) => {
  await startSeason(page, false);
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  await page.reload();
  await button(page, 'Settings').click();
  await button(page, /Reset save/).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete save' }).click();
  await expect(button(page, /Continue Farming/)).toHaveCount(0);
  expect(await savedGame(page)).toBeNull();
});

test('a corrupted save is preserved and the player is offered a safe way forward', async ({ page }) => {
  await page.addInitScript(k => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, '{"version":1,"game":{"day":'); sessionStorage.setItem('seeded', '1'); } }, SAVE_KEY);
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: "couldn't be loaded" })).toBeVisible();
  await expect(button(page, /Continue Farming/)).toHaveCount(0);
  await expect(button(page, 'Download the save file')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('h2h.save.unreadable'))).toBe('{"version":1,"game":{"day":');
  expect(await page.evaluate(k => localStorage.getItem(k), SAVE_KEY)).toBe('{"version":1,"game":{"day":');

  await button(page, /Start New Season/).click();
  await expect(page.getByRole('alertdialog')).toContainText('backed up');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start new season' }).click();
  expect((await savedGame(page)).game.day).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('h2h.save.unreadable'))).toBe('{"version":1,"game":{"day":');
});

test('reloading mid-contract, mid-shipment, mid-drying and mid-loan restores everything once, and the next day matches the simulation', async ({ page }) => {
  const farm = busyFarm();
  const raw = serializeSave(farm, { reportSeenDay: farm.day, tutorial: { status: 'skipped', step: 0 } });
  await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [SAVE_KEY, raw]);
  await page.goto('/');
  await expect(button(page, /Continue Farming/)).toContainText(`Day ${farm.day}`);

  for (let i = 0; i < 3; i++) {
    if (i > 0) await page.reload();
    await button(page, /Continue Farming/).click();
    await expect(page.locator('.stat', { hasText: 'Day' }).locator('b')).toHaveText(String(farm.day));
    // The saved farm still has Baba's unread mission card: it is restored too, until dismissed.
    if (i === 0) await button(page, 'Got it').click();
  }
  // Three reloads later, nothing was charged, paid, shipped or dried twice.
  await button(page, 'Menu').click();
  await button(page, /Save & main menu/).click();
  const reloaded = (await savedGame(page)).game;
  for (const k of ['day', 'cash', 'finance', 'loans', 'shipments', 'contracts', 'dryingJobs', 'batches', 'missions', 'rng'] as const) expect(reloaded[k], k).toEqual(farm[k]);

  // The browser's next day is exactly the simulation's next day.
  await button(page, /Continue Farming/).click();
  await page.locator('nav.bottom').getByRole('button', { name: 'Trade' }).click();
  await expect(page.locator('.modal')).toContainText(/Lagos|London|road|port|sea/i);
  await page.getByRole('button', { name: 'Close' }).click();
  await endDay(page);
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  const next = advanceDay(farm);
  const played = (await savedGame(page)).game;
  for (const k of ['day', 'cash', 'finance', 'loans', 'shipments', 'contracts', 'dryingJobs', 'weather', 'rng'] as const) expect(played[k], k).toEqual(next[k]);
});

test('mobile: touch hints, tutorial and HUD fit a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await startSeason(page, true);
  await expect(tutorialCard(page).locator('.hint-touch')).toBeVisible();
  await expect(tutorialCard(page).locator('.hint-mouse')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-tut=end-day]').tap();
  await expect(page.locator('.stat', { hasText: 'Day' }).locator('b')).toHaveText('2');
  await context.close();
});
