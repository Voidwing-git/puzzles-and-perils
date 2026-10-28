import { test, expect } from '@playwright/test';

test('compact GM toolbar and private tray menu restore or give independently', async ({ page }) => {
  await page.setViewportSize({width:700,height:1050});
  await page.goto('/');
  await page.locator('#edit-puzzle').click();
  await page.locator('#draft-free').check();
  await page.locator('#draft-recovery').selectOption('socket');
  const indices: number[]=[];
  for(let i=0;i<2;i++) {
    const tile=page.locator('#draft-board button[aria-label^="Remove"]:enabled').first();
    indices.push(await tile.evaluate(el=>[...el.parentElement!.children].indexOf(el)));
    await tile.click();
    await page.locator('#draft-label').fill('Vault key conduit');
  }
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  const board=await page.locator('#board').boundingBox();
  const tools=await page.locator('#gm-toolbar').boundingBox();
  expect(tools!.y+tools!.height).toBeLessThan(board!.y);
  await expect(page.locator('#turn-order-panel #free-play')).toBeVisible();
  await expect(page.locator('#discoveries-panel')).toHaveCount(0);
  const card=page.locator('.unknown-piece').first();
  const cellBounds=await page.locator('#board button').first().boundingBox();
  const pieceBounds=await card.boundingBox();
  expect(Math.abs(pieceBounds!.width-cellBounds!.width)).toBeLessThan(1);
  expect(Math.abs(pieceBounds!.height-cellBounds!.height)).toBeLessThan(1);
  await card.hover(); await expect(card).toHaveAttribute('title','Vault key conduit');
  await card.click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'Restore piece',exact:true})).toBeVisible();
  await page.screenshot({path:'docs/evidence/compact-tray-context.png',fullPage:true});
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
  await card.focus(); await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem',{name:'Restore piece',exact:true}).click();
  await expect(page.locator('#board button').nth(indices[0])).toHaveClass(/occupied/);
  await expect(page.locator('#inventory option')).toHaveCount(0);
  await page.locator('.unknown-piece').click();
  await page.getByRole('menuitem',{name:'Give piece to players',exact:true}).click();
  await expect(page.locator('#board button').nth(indices[1])).toHaveClass(/empty/);
  await expect(page.locator('#inventory option')).toHaveCount(1);
  await expect(page.locator('.unknown-piece')).toHaveCount(0);
  await page.screenshot({path:'docs/evidence/compact-board-tray.png',fullPage:true});
});
