import {test,expect} from '@playwright/test';

for(const reduced of [false,true])test('compact counter tracks 1/2 to 2/2 and retains its power-color glow '+reduced,async({page})=>{
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.goto('/');
  const name=await page.locator('#turn-order-list .order-player-name').first().boundingBox();
  const controls=await page.locator('#turn-order-list .order-actions').first().boundingBox();
  expect(controls!.y).toBeGreaterThanOrEqual(name!.y+name!.height);
  await expect(page.locator('#target-count')).toHaveCount(0);
  await page.locator('#fixture').selectOption('last-connection');page.once('dialog',d=>d.accept());await page.locator('#load-board').click();
  const counter=page.locator('.goal-counter.azure');
  await expect(counter).toHaveText('1/2');await expect(counter).not.toHaveClass(/full/);
  await page.locator('#board [data-index="6"]').click();await page.locator('#rotate').click();
  await expect(counter).toHaveText('2/2');await expect(counter).toHaveClass(/full/);
  await expect(counter).toHaveCSS('box-shadow',/164, 245, 238/);
  await page.locator('#next-turn').click();await expect(page.locator('#success[data-solved="true"]')).toBeVisible();
  await expect(page.locator('#success')).toHaveCount(1);
  await expect(page.locator('.board-panel #success')).toHaveCount(0);
  const banner=await page.locator('#success').boundingBox();
  const board=await page.locator('#board').boundingBox();
  const goals=await page.locator('#goal-status-panel').boundingBox();
  expect(banner!.y+banner!.height).toBeLessThan(board!.y);
  expect(banner!.x).toBeLessThan(goals!.x);
  if(reduced)expect(await page.locator('#success').getAttribute('data-celebration-count')).toBeNull();
  else await expect(page.locator('#success')).toHaveAttribute('data-celebration-count','1');
  await page.locator('#board [data-index="7"]').click();
  if(!reduced){await expect(page.locator('#success')).toHaveAttribute('data-celebration-count','1');await page.screenshot({path:'docs/evidence/upper-left-completion-banner.png'});}
  await expect(page.locator('#turn-order-panel')).not.toContainText('Puzzle complete');
  await expect(page.locator('#goal-status-panel')).toHaveText('2/2');
  await expect(counter).toHaveClass(/full/);
});

test('each power has its own clean count and only completed colors glow',async({page})=>{
  await page.goto('/');await page.locator('#fixture').selectOption('dual-power');page.once('dialog',d=>d.accept());await page.locator('#load-board').click();
  await page.locator('#free-play').check();
  const azure=page.locator('.goal-counter.azure'),amber=page.locator('.goal-counter.amber');
  await expect(azure).toHaveText('0/1');await expect(amber).toHaveText('0/1');
  for(let i=0;i<3;i++){await page.locator('#board [data-index="6"]').dblclick();await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');}
  await expect(azure).toHaveText('1/1');await expect(azure).toHaveClass(/full/);
  await expect(amber).toHaveText('0/1');await expect(amber).not.toHaveClass(/full/);
  await page.locator('#board [data-index="17"]').dblclick();
  await expect(amber).toHaveText('1/1');await expect(amber).toHaveClass(/full/);
  await expect(azure).toHaveCSS('box-shadow',/164, 245, 238/);
  await expect(amber).toHaveCSS('box-shadow',/255, 218, 140/);
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
  await expect(amber).toHaveCSS('opacity','1');
  await page.screenshot({path:'docs/evidence/compact-color-goal-counts.png'});
});
