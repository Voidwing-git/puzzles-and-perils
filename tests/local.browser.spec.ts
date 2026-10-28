import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

function tile(page: Page, coordinate: string) { return page.getByRole('button', { name: new RegExp(`^${coordinate},`) }); }
const rotateButton = (page: Page) => page.getByRole('button', { name: 'Rotate 90° clockwise' });
async function load(page: Page, fixture: string) {
  await page.getByLabel('Prepared board').selectOption(fixture);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Load prepared board' }).click();
  await expect(page.locator('#revision')).toHaveText('Revision 0');
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('desktop render, selected tile inspection, symbols and no runtime/asset errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.reload();
  await expect(page.locator('#puzzle-title')).toBeVisible();
  await expect(page.getByText('Local demo · M3', { exact: true })).toBeVisible();
  await expect(page.locator('#board button')).toHaveCount(25);
  await expect(page.locator('.goal-counter strong')).toHaveText('0/2');
  await tile(page, 'A3').click();
  await expect(page.locator('#selection-detail')).toContainText('Fixed terminal');
  await expect(page.locator('#selection-detail')).toContainText('✦ Powered');
  await expect(rotateButton(page)).toBeDisabled();
  await expect(page.locator('.powered-mark')).toHaveCount(1);
  await expect(page.locator('.legend-power')).toHaveText('✦');
  await page.screenshot({ path: 'docs/evidence/m1-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('mouse turn route, spectator restrictions, fixed/empty inspection and double click', async ({ page }) => {
  await tile(page, 'B2').click();
  await expect(rotateButton(page)).toBeEnabled();
  await page.getByLabel('Play as').selectOption('orin');
  await expect(rotateButton(page)).toBeDisabled();
  await expect(page.locator('#turn-hint')).toContainText('Wait for Lyra');
  await page.getByLabel('Play as').selectOption('spectator');
  await expect(rotateButton(page)).toBeDisabled();
  await page.getByLabel('Play as').selectOption('lyra');
  await tile(page, 'B2').dblclick();
  await expect(page.locator('#revision')).toHaveText('Revision 1');
  await expect(page.locator('#action-count')).toHaveText('Editing B2');
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
  await expect(rotateButton(page)).toBeEnabled();
  await rotateButton(page).click();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings east and south/);
  await page.getByRole('button', { name: 'End turn' }).click();
  await expect(page.locator('#active-player')).toHaveText('Orin’s turn');
  await expect(rotateButton(page)).toBeDisabled();
  await page.getByLabel('Play as').selectOption('orin');
  await expect(rotateButton(page)).toBeEnabled();
  await tile(page, 'B1').click();
  await expect(page.locator('#selection-detail')).toContainText('No piece is present');
  await expect(rotateButton(page)).toBeDisabled();
  await tile(page, 'E2').click();
  await expect(rotateButton(page)).toBeDisabled();
});

test('keyboard navigation, selection and rotation completes the introduction', async ({ page }) => {
  await load(page, 'last-connection');
  await expect(page.locator('.goal-counter strong')).toHaveText('1/2');
  await tile(page, 'A1').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tile(page, 'A1')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(tile(page, 'B2')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tile(page, 'B2')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('r');
  await expect(page.locator('#success')).toBeVisible();
  await expect(page.locator('.goal-counter strong')).toHaveText('2/2');
  await expect(tile(page, 'B2')).toBeFocused();
  await expect(rotateButton(page)).toBeEnabled();
  await expect(page.locator('#success-detail')).toContainText('End the turn to confirm');
  await page.getByRole('button', { name: 'End turn' }).click();
  await expect(rotateButton(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
  await expect(page.locator('#revision')).toHaveText('Revision 2');
  await page.screenshot({ path: 'docs/evidence/m1-solved.png', fullPage: true });
});

test('complete relay by alternating actual local player turns', async ({ page }) => {
  // Independent known route: restore tee, elbow branches, and lower straight.
  const steps = ['B3', 'B3', 'B3', 'B2', 'B2', 'C3', 'D4'];
  for (let index = 0; index < steps.length; index++) {
    await page.getByLabel('Play as').selectOption(index % 2 === 0 ? 'lyra' : 'orin');
    await tile(page, steps[index]).click();
    await rotateButton(page).click();
    await expect(page.locator('#revision')).toHaveText(`Revision ${index * 2 + 1}`);
    if (index < steps.length - 1) {
      await page.getByRole('button', { name: 'End turn' }).click();
      await expect(page.locator('#revision')).toHaveText(`Revision ${index * 2 + 2}`);
    }
  }
  await expect(page.locator('#success')).toBeVisible();
  await expect(page.locator('.goal-counter strong')).toHaveText('2/2');
  await page.getByRole('button', { name: 'End turn' }).click();
  await expect(page.locator('#success-title')).toHaveText('The runes are awakened');
});

test('missing piece projection, Space selection, safe load cancellation and fresh board', async ({ page }) => {
  await load(page, 'broken-conduit');
  await tile(page, 'B2').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#selection-title')).toHaveText('B2 · empty socket');
  await expect(rotateButton(page)).toBeDisabled();
  await expect(page.locator('.goal-counter strong')).toHaveText('1/2');
  expect(await page.locator('#board').innerText()).not.toContain('archivist');
  await page.getByLabel('Prepared board').selectOption('relay');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Load prepared board' }).click();
  await expect(page.locator('#puzzle-title')).toHaveText('The broken conduit');
  await load(page, 'relay');
  await expect(page.locator('#selection-title')).toHaveText('Select a tile');
  await expect(page.locator('#active-player')).toHaveText('Lyra’s turn');
});

test('compact layout and reduced motion retain working controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, 'last-connection');
  await tile(page, 'B2').click();
  await rotateButton(page).click();
  await expect(page.locator('#success')).toBeVisible();
  await page.getByRole('button', { name: 'End turn' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.tile').first().evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  await page.screenshot({ path: 'docs/evidence/m1-compact.png', fullPage: true });
});

test('switching selection rolls back preview, double-click switches and rotates exactly once', async ({ page }) => {
  await tile(page, 'B2').dblclick();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
  await rotateButton(page).click();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings east and south/);
  await tile(page, 'C3').dblclick();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings west and north/);
  await expect(tile(page, 'C3')).toHaveAttribute('aria-label', /openings south and west/);
  await expect(page.locator('#action-count')).toHaveText('Editing C3');
  await tile(page, 'B1').click();
  await expect(tile(page, 'C3')).toHaveAttribute('aria-label', /openings east and south/);
  await expect(page.locator('#action-count')).toHaveText('Choose one piece');
  await tile(page, 'B2').dblclick();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
  await page.getByLabel('Play as').selectOption('orin');
  await tile(page, 'C3').click();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
  await expect(page.locator('#action-count')).toHaveText('Editing B2');
});

test('keyboard selecting a different tile restores preview, and repeated R rotations work', async ({ page }) => {
  await tile(page, 'B2').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('r');
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
  await page.keyboard.press('r');
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings east and south/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings west and north/);
  await expect(page.locator('#action-count')).toHaveText('Choose one piece');
});

test('free-play toggle preserves rotations across players and turns can resume', async ({ page }) => {
  await tile(page, 'B2').dblclick();
  await expect(page.locator('#action-count')).toHaveText('Editing B2');
  await page.getByLabel('Free play (turns off)').check();
  await expect(page.locator('#active-player')).toHaveText('Free play');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
  await page.getByLabel('Play as').selectOption('orin');
  await tile(page, 'C3').dblclick();
  await expect(tile(page, 'C3')).toHaveAttribute('aria-label', /openings south and west/);
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
  await page.getByLabel('Play as').selectOption('spectator');
  await tile(page, 'D4').dblclick();
  await expect(tile(page, 'D4')).toHaveAttribute('aria-label', /openings north and south/);
  await expect(rotateButton(page)).toBeDisabled();
  await page.getByLabel('Free play (turns off)').uncheck();
  await expect(page.locator('#active-player')).toHaveText('Lyra’s turn');
  await page.getByLabel('Play as').selectOption('lyra');
  await tile(page, 'B2').dblclick();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings east and south/);
  await tile(page, 'D4').click();
  await expect(tile(page, 'B2')).toHaveAttribute('aria-label', /openings north and east/);
});

test('free play completes directly without a turn commit', async ({ page }) => {
  await load(page, 'last-connection');
  await page.getByLabel('Free play (turns off)').check();
  await page.getByLabel('Play as').selectOption('orin');
  await tile(page, 'B2').dblclick();
  await expect(page.locator('#success-title')).toHaveText('The runes are awakened');
  await expect(rotateButton(page)).toBeDisabled();
});
