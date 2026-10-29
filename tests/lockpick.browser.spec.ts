import {test,expect} from '@playwright/test';

async function lockPage(page:import('@playwright/test').Page){
  await page.goto('/');await page.locator('#open-setup').click();
  await expect(page.getByRole('heading',{name:'Choose a puzzle'})).toBeVisible();
  await expect(page.locator('#draft-size')).toHaveCount(0);
  await expect(page.locator('.puzzle-type-card img')).toHaveCount(2);
  await expect.poll(()=>page.locator('.puzzle-type-card img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.locator('#choose-lockpick').click();
  for(const label of ['Novice','Apprentice','Adept','Expert','Master'])await expect(page.locator('.lock-difficulties')).toContainText(label);
  await page.locator('[name="lock-difficulty"][value="expert"]').check();
  await expect(page.locator('#lock-preview-difficulty')).toHaveText('Expert · DC 20');
  await page.locator('#publish-lock').click();await expect(page.locator('#lock-game')).toBeVisible();
}
test('creator chooser, lock difficulty, break gate, GM replacement and opening work through real controls',async({page})=>{
  await lockPage(page);
  const angle=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).lockSecret.sweetSpot as number);
  const slider=page.locator('#lock-game .lock-angle');
  await slider.fill(String(angle>0?-90:90));
  await page.locator('#lock-game .lock-surface').focus();await page.keyboard.down('Space');
  await expect(page.locator('#lock-game')).toHaveClass(/pick-broken/,{timeout:10000});await page.keyboard.up('Space');
  await expect(page.locator('.lock-status')).toContainText('Waiting for the GM');
  await expect(slider).toBeDisabled();await expect(page.locator('.lock-torque')).toBeDisabled();
  await page.screenshot({path:'docs/evidence/lockpick-broken.png',fullPage:true});
  await page.locator('.lock-give').click();await expect(slider).toBeEnabled();
  await slider.fill(String(angle));await page.locator('#lock-game .lock-surface').focus();await page.keyboard.down('Space');
  await expect(page.locator('#success-title')).toHaveText('The lock opens');await page.keyboard.up('Space');
  await expect(page.locator('#success')).toBeVisible();await expect(page.locator('#goal-status-panel')).toBeHidden();
  await expect(page.locator('.inventory-panel')).toBeHidden();
  await page.reload();await expect(page.locator('#success-title')).toHaveText('The lock opens');
  await page.locator('#edit-puzzle').click();await expect(page.locator('[name="lock-difficulty"][value="expert"]')).toBeChecked();
});
test('releasing torque early preserves the pick and spectator input cannot move a lock',async({page})=>{
  await lockPage(page);await page.locator('#lock-game .lock-angle').fill('-90');
  const torque=page.locator('.lock-torque'),box=(await torque.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect(page.locator('#revision')).toHaveText('Revision 1');await page.mouse.up();
  await expect(page.locator('#lock-game')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.lock-condition meter')).toHaveAttribute('value','100');
  await page.locator('#viewer').selectOption('spectator');await expect(torque).toBeDisabled();
  await page.locator('#lock-game .lock-surface').focus();await page.keyboard.press('Space');await expect(page.locator('#revision')).toHaveText('Revision 1');
});
test('puzzle picker can go back and open the existing pipe builder; lock UI respects reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#open-setup').click();
  await page.screenshot({path:'docs/evidence/puzzle-type-picker.png',fullPage:true});
  await page.locator('#choose-lockpick').click();await page.locator('.puzzle-types-back').click();await page.locator('#choose-pipes').click();
  await expect(page.locator('#draft-board button')).toHaveCount(25);
  await page.locator('.puzzle-types-back').click();await page.locator('#choose-lockpick').click();await page.locator('#publish-lock').click();
  await expect(page.locator('#lock-game .lock-cylinder')).toHaveCSS('transition-duration','0s');
});
