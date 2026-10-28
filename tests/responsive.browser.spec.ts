import { test, expect } from '@playwright/test';

test('gameplay fits desktop, portrait and landscape with full-size tray pieces; creator keeps its sidebar', async ({ page }) => {
  await page.setViewportSize({width:1160,height:1036});
  await page.goto('/'); await page.locator('#edit-puzzle').click();
  const settings=await page.locator('.setup-settings').boundingBox();
  const preview=await page.locator('.setup-preview').boundingBox();
  expect(settings!.x+settings!.width).toBeLessThan(preview!.x);
  await expect(page.locator('#draft-board')).toBeInViewport();
  await page.screenshot({path:'docs/evidence/responsive-creator-sidebar.png',fullPage:true});
  await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  for (const [width,height] of [[1160,1036],[1000,760],[768,1024],[390,844],[844,390]]) {
    await page.setViewportSize({width,height});
    await expect.poll(()=>page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)-innerHeight)).toBeLessThanOrEqual(2);
    await expect.poll(async()=> {
      const cell=await page.locator('#board button').first().boundingBox();
      const piece=await page.locator('.unknown-piece').first().boundingBox();
      return Math.abs(cell!.width-piece!.width);
    }).toBeLessThan(1);
    const bounds=await page.locator('#board').boundingBox();
    expect(bounds!.width).toBeGreaterThan(100);
    await expect(page.locator('.inventory-panel')).toBeInViewport({ratio:1});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`docs/evidence/responsive-${width}x${height}.png`});
  }
});
