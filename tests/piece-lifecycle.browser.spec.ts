import {test,expect} from '@playwright/test';

test('creator tray edits piece information; board stays stable and placed pieces recall by outline or context menu',async({page})=>{
  await page.setViewportSize({width:1100,height:950});await page.goto('/');await page.locator('#edit-puzzle').click();
  await page.locator('#draft-free').check();
  const indices:number[]=[];
  for(const name of ['Vault conduit','Garden conduit']){
    const tile=page.locator('#draft-board button[aria-label^="Remove"]:enabled').first();
    indices.push(await tile.evaluate(el=>[...el.parentElement!.children].indexOf(el)));await tile.click();
    await page.locator('#draft-label').fill(name);await page.locator('#draft-notes').fill('PRIVATE NOTES '+name);
  }
  await page.locator('#draft-tray [data-removed-index="'+indices[0]+'"]').click();
  await expect(page.locator('#draft-label')).toHaveValue('Vault conduit');
  await expect(page.locator('#draft-notes')).toHaveValue('PRIVATE NOTES Vault conduit');
  await expect(page.locator('#draft-board .missing-tile')).toHaveCount(2);
  await page.screenshot({path:'docs/evidence/creator-tray-piece-information.png',fullPage:true});
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('#board .missing-tile')).toHaveCount(2);
  await expect.poll(async()=>{const a=await page.locator('#board').boundingBox();await new Promise(r=>setTimeout(r,60));const b=await page.locator('#board').boundingBox();return Math.abs(a!.width-b!.width);}).toBeLessThan(1);
  const width=(await page.locator('#board').boundingBox())!.width;
  await page.locator('.unknown-piece').first().click();await page.getByRole('menuitem',{name:'Give piece to players',exact:true}).click();
  const socket=page.locator('#board button').nth(indices[0]);
  await socket.click();
  await page.locator('#board button.occupied:not(.source):not(.target)').first().click();
  expect(Math.abs((await page.locator('#board').boundingBox())!.width-width)).toBeLessThan(1);
  await socket.click();await page.locator('#place-piece').click();
  await expect(socket).toHaveClass(/replaced-tile/);
  await expect(page.locator('.placed-piece')).toHaveCount(1);
  await expect(page.locator('.placed-piece')).toHaveAttribute('aria-disabled','false');
  expect(Math.abs((await page.locator('#board').boundingBox())!.width-width)).toBeLessThan(1);
  await page.screenshot({path:'docs/evidence/placed-piece-recall-outline.png',fullPage:true});
  await page.locator('.placed-piece').click();await expect(socket).toHaveClass(/empty/);
  await expect(page.locator('#inventory option')).toHaveCount(1);
  await socket.click();await page.locator('#place-piece').click();
  await expect(socket).toHaveClass(/replaced-tile/);
  await expect(page.locator('.placed-piece')).toHaveAttribute('aria-disabled','false');
  await socket.click({button:'right'});await page.getByRole('menuitem',{name:'Remove to tray',exact:true}).click();
  await expect(socket).toHaveClass(/empty/);await expect(page.locator('#inventory option')).toHaveCount(1);
  await expect(page.locator('.placed-piece')).toHaveCount(0);
  expect(Math.abs((await page.locator('#board').boundingBox())!.width-width)).toBeLessThan(1);
  await page.locator('#edit-puzzle').click();
  await page.locator('#draft-tray [data-removed-index="'+indices[1]+'"]').click();
  await expect(page.locator('#draft-label')).toHaveValue('Garden conduit');
  await expect(page.locator('#draft-notes')).toHaveValue('PRIVATE NOTES Garden conduit');
});
