import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { PrivatePreparation } from '../src/core/state.ts';

test('Randomize changes the solved layout repeatedly while retaining settings and the active puzzle', async ({ page }) => {
  await page.goto('/'); await page.locator('#open-setup').click();
  await page.locator('#draft-size').selectOption('4');
  await page.locator('#draft-powers').selectOption('2');
  await page.locator('#draft-targets').selectOption('1');
  let previous = '';
  for (let i = 0; i < 5; i++) {
    await page.locator('#draft-solution').check();
    const layout = await page.locator('#draft-board').innerHTML();
    if (previous) expect(layout).not.toEqual(previous);
    previous = layout;
    await page.getByRole('button', {name:'Randomize',exact:true}).click();
    await expect(page.locator('#draft-size')).toHaveValue('4');
    await expect(page.locator('#draft-powers')).toHaveValue('2');
    await expect(page.locator('#draft-targets')).toHaveValue('1');
    await expect(page.locator('#board button')).toHaveCount(25);
  }
});

test('Make a puzzle shows settings and immediate preview, restores removed pieces, and finalizes explicitly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', {name:'Make a puzzle',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Make a puzzle',exact:true})).toBeVisible();
  await expect(page.locator('#draft-size')).toBeVisible();
  await expect(page.locator('#draft-board button')).toHaveCount(25);
  await page.locator('#draft-size').selectOption('6');
  await page.locator('#draft-powers').selectOption('3');
  await expect(page.locator('#draft-board button')).toHaveCount(36);
  const tile = page.locator('#draft-board button[aria-label^="Remove"]:enabled').first();
  expect((await tile.boundingBox())!.width).toBeGreaterThan(70);
  await tile.click(); await expect(page.locator('#draft-summary')).toContainText('1 removed');
  await page.locator('#draft-restore').click();
  await expect(page.locator('#draft-summary')).toContainText('0 removed');
  expect(await page.locator('#authoring').innerText()).not.toMatch(/draft|publish/i);
  await page.getByRole('button',{name:'Back to GM view',exact:true}).click();
  await expect(page.locator('#board button')).toHaveCount(25);
  await page.getByRole('button',{name:'Make a puzzle',exact:true}).click();
  await expect(page.locator('#draft-board button')).toHaveCount(36);
  page.once('dialog', d => d.accept()); await page.getByRole('button',{name:'Finalize puzzle',exact:true}).click();
  await expect(page.locator('#play-screen')).toBeVisible();
  await expect(page.locator('#authoring')).toBeHidden();
  await expect(page.locator('#view-label')).toHaveText('GM view');
  await expect(page.locator('#board button')).toHaveCount(36);
});

test('adventure loop: private preparation, export, two discoveries, tray rollback, player placement and solution', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#open-setup').click();
  await page.locator('#draft-size').selectOption('4');
  await page.getByText('More options', {exact:true}).click();
  await page.locator('#draft-seed').fill('m3-ui-adventure');
  await page.locator('#generate-draft').click();
  await page.locator('#draft-recovery').selectOption('tray');
  await expect(page.locator('#board button')).toHaveCount(25);
  await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click(); await page.locator('#draft-label').fill('SECRET vault discovery');
  await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click(); await page.locator('#draft-label').fill('SECRET vault discovery');
  await expect(page.locator('#draft-summary')).toContainText('2 removed');
  await page.locator('#draft-solution').check();
  await page.screenshot({ path: 'docs/evidence/m3-private-preparation.png', fullPage: true });
  await page.locator('#draft-solution').uncheck();
  if (!(await page.locator('#export-draft').isVisible())) await page.getByText('More options',{exact:true}).click();
  const downloading = page.waitForEvent('download'); await page.locator('#export-draft').click();
  const download = await downloading;
  const preparation = JSON.parse(await readFile((await download.path())!, 'utf8')).preparation as PrivatePreparation;
  page.once('dialog', d => d.accept()); await page.locator('#publish-draft').click();
  await expect(page.locator('#board button')).toHaveCount(16);
  await expect(page.locator('#piece-tray .unknown-piece')).toHaveCount(2);
  await expect(page.locator('#piece-tray .unknown-piece').first()).toHaveAttribute('title','SECRET vault discovery');
  await page.screenshot({path:'docs/evidence/m3-find-pieces.png',fullPage:true});
  for (let i = 0; i < 2; i++) { await page.locator('#piece-tray .unknown-piece').first().click({button:'right'}); await page.getByRole('menuitem',{name:'Give piece to players',exact:true}).click(); await expect(page.locator('#inventory option')).toHaveCount(i + 1); }
  const first = preparation.withheld[0].index;
  const second = preparation.withheld[1].index;
  const firstPiece = await page.locator('#inventory').inputValue();
  await page.locator(`[data-index="${first}"]`).click(); await page.locator('#place-piece').click();
  await expect(page.locator('#inventory option')).toHaveCount(1);
  await page.locator('#rotate').click();
  await page.locator(`[data-index="${second}"]`).click();
  await expect(page.locator('#inventory option')).toHaveCount(2);
  await expect(page.locator(`[data-index="${first}"]`)).toHaveClass(/empty/);
  await page.locator('#piece-tray button[data-piece-id="' + firstPiece + '"]').click();
  await page.locator(`[data-index="${first}"]`).click(); await page.locator('#place-piece').click(); await page.locator('#next-turn').click();
  await page.locator('#viewer').selectOption('orin');
  await page.locator(`[data-index="${second}"]`).click(); await page.locator('#place-piece').click(); await page.locator('#next-turn').click();
  // Derive the review solution from the normal private export, then execute
  // every correction through player selection, rotation and End turn controls.
  for (let index = 0; index < preparation.solution.length; index++) {
    await expect(page.locator('#viewer')).toBeEnabled();
    const tile = preparation.solution[index]; if (!tile || tile.terminal) continue;
    const actual = preparation.withheld.some(p => p.index === index) ? 0 : preparation.state.tiles[index]!.rotation;
    const turns = (tile.rotation - actual + 4) % 4; if (!turns) continue;
    const current = await page.locator('#active-player').innerText();
    if (await page.locator('#success[data-solved="true"]').isVisible()) break;
    await page.locator('#viewer').selectOption(current.startsWith('Lyra') ? 'lyra' : 'orin');
    await page.locator(`[data-index="${index}"]`).click();
    for (let n = 0; n < turns; n++) await page.locator('#rotate').click();
    await page.locator('#next-turn').click();
  }
  await expect(page.locator('#success[data-solved="true"]')).toBeVisible();
  await page.screenshot({ path: 'docs/evidence/m3-adventure-complete.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('all 18 configurations publish readable boards; socket recovery preserves existing rotations', async ({ page }) => {
  await page.goto('/'); await page.locator('#open-setup').click();
  for (const size of [4, 5, 6]) for (const powers of [1, 2, 3]) for (const targets of [1, 2]) {
    if (await page.locator('#open-setup').isVisible()) await page.locator('#open-setup').click();
    await page.locator('#draft-size').selectOption(String(size)); await page.locator('#draft-powers').selectOption(String(powers));
    await page.locator('#draft-targets').selectOption(String(targets)); await page.locator('#generate-draft').click();
    page.once('dialog', d => d.accept()); await page.locator('#publish-draft').click();
    await expect(page.locator('#board button')).toHaveCount(size * size);
    await expect(page.locator('.goal-counter')).toHaveCount(powers);
    for(const counter of await page.locator('.goal-counter strong').all()) await expect(counter).toContainText('/'+targets);
    const bounds = await page.locator('#board button').first().boundingBox(); expect(bounds!.width).toBeGreaterThan(60);
    expect(await page.locator('#board').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.screenshot({ path: 'docs/evidence/m3-six-by-six.png', fullPage: true });
  await page.locator('#open-setup').click();
  await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  page.once('dialog', d => d.accept()); await page.locator('#publish-draft').click();
  await page.locator('#free-play').check();
  const index = await page.locator('#board button.occupied:not(.source):not(.target)').first().getAttribute('data-index');
  const tile = page.locator(`#board [data-index="${index}"]`);
  await tile.dblclick(); await expect(page.locator('#revision')).toHaveText('Revision 2');
  // Recovery may legitimately change power markers; channel orientation must stay.
  const svg = await tile.locator('.rotating-piece').innerHTML();
  await page.locator('#piece-tray .unknown-piece').first().click({button:'right'}); await page.getByRole('menuitem',{name:'Restore piece',exact:true}).click();
  await expect(page.locator('#revision')).toHaveText('Revision 3');
  expect(await tile.locator('.rotating-piece').innerHTML()).toEqual(svg);
  await expect(page.locator('#piece-tray .unknown-piece')).toHaveCount(0);
});

test('private storage failure blocks publication without changing the active board', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('storage denied'); }; });
  await page.goto('/'); await page.locator('#open-setup').click();
  await page.locator('#generate-draft').click();
  await expect(page.locator('#draft-status')).toContainText('Private save unavailable');
  await page.locator('#publish-draft').click();
  await expect(page.locator('#puzzle-title')).toHaveText('The arcane relay');
  await page.getByText('More options',{exact:true}).click();
  const downloading = page.waitForEvent('download'); await page.locator('#export-draft').click();
  expect((await downloading).suggestedFilename()).toContain('SPOILERS');
});

test('Randomize generates separate leaf goals instead of consecutive pass-through goals', async ({page}) => {
  await page.goto('/');await page.locator('#open-setup').click();
  await page.locator('#draft-size').selectOption('5');
  await page.locator('#draft-powers').selectOption('1');
  await page.locator('#draft-targets').selectOption('2');
  for(let attempt=0;attempt<8;attempt++) {
    await page.locator('#generate-draft').click();
    await page.locator('#draft-solution').check();
    const goals=page.locator('#draft-board button[aria-label*=", target"]');
    await expect(goals).toHaveCount(2);
    const indices=await goals.evaluateAll(buttons=>buttons.map(button=>[...button.parentElement!.children].indexOf(button)));
    expect(Math.abs(indices[0]%5-indices[1]%5)+Math.abs(Math.floor(indices[0]/5)-Math.floor(indices[1]/5))).toBeGreaterThan(1);
    for(const goal of await goals.all()) expect(((await goal.locator('.channel-rim').getAttribute('d'))!.match(/M/g)??[]).length).toBe(1);
  }
  await page.screenshot({path:'docs/evidence/separate-goal-endpoints.png',fullPage:true});
});
