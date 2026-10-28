import {test,expect} from '@playwright/test';

test('left GM order editor and vertical right tray preserve current turn and piece lifecycle',async({page})=>{
  await page.setViewportSize({width:1200,height:1000});await page.goto('/');
  await page.locator('#edit-puzzle').click();
  for(let i=0;i<3;i++)await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Move Orin up',exact:true}).click();
  await expect(page.locator('#turn-order-list li').first()).toContainText('Orin');
  await expect(page.locator('#turn-order-list .active-turn')).toContainText('Lyra');
  await page.getByRole('button',{name:'Remove Lyra',exact:true}).click();
  await expect(page.locator('#turn-order-list li')).toHaveCount(1);
  await page.locator('#add-player').selectOption('lyra');await page.locator('#add-player-button').click();
  await expect(page.locator('#turn-order-list li')).toHaveCount(2);
  await expect(page.locator('#turn-order-list .active-turn')).toContainText('Orin');
  const left=await page.locator('#turn-order-panel').boundingBox();const board=await page.locator('#board').boundingBox();const tray=await page.locator('.inventory-panel').boundingBox();
  expect(left!.x+left!.width).toBeLessThan(board!.x);expect(tray!.x).toBeGreaterThan(board!.x+board!.width);
  const cards=page.locator('.unknown-piece');const a=await cards.nth(0).boundingBox(),b=await cards.nth(1).boundingBox();expect(b!.y).toBeGreaterThan(a!.y);expect(Math.abs(b!.x-a!.x)).toBeLessThan(1);
  await expect(page.locator('#turn-order-panel #free-play')).toBeVisible();await expect(page.locator('#turn-order-panel #next-turn')).toBeVisible();
  await page.screenshot({path:'docs/evidence/order-and-vertical-tray.png'});
});
