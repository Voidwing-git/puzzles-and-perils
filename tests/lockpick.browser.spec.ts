import {test,expect} from '@playwright/test';

async function lockPage(page:import('@playwright/test').Page){
  await page.goto('/');await page.locator('#open-setup').click();
  await expect(page.getByRole('heading',{name:'Choose a puzzle'})).toBeVisible();
  await expect(page.locator('#draft-size')).toHaveCount(0);
  await expect(page.locator('.puzzle-type-card img')).toHaveCount(13);
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
  await expect(page.locator('#success')).toBeVisible();await expect(page.locator('#success-title')).toHaveText('The lock opens');await page.keyboard.up('Space');
  await expect(page.locator('#success')).toBeVisible();await expect(page.locator('#goal-status-panel')).toBeHidden();
  await expect(page.locator('.inventory-panel')).toBeHidden();
  await page.reload();await expect(page.locator('#success-title')).toHaveText('The lock opens');
  await page.locator('#edit-puzzle').click();await expect(page.locator('[name="lock-difficulty"][value="expert"]')).toBeChecked();
});

test('GM preview shows a matching private angle bar and slice across difficulty and randomization',async({page})=>{
  await lockPage(page);await page.locator('#edit-puzzle').click();
  const guide=page.locator('#lock-zone-bar');await expect(guide).toBeVisible();await expect(page.locator('.lock-zone')).toHaveCount(1);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).lockSecret.sweetSpot as number);
  await expect(guide).toHaveAttribute('aria-label',new RegExp(`Opening angle ${saved>0?'\\+':''}${saved}°`));
  await expect.poll(()=>guide.evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--zone-width')))).toBeCloseTo(8/180*100,5);
  await page.locator('[name="lock-difficulty"][value="novice"]').check();
  const range=await guide.evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--zone-width')));expect(range).toBeGreaterThan(16);
  await page.locator('#randomize-lock').click();
  await page.screenshot({path:'docs/evidence/lockpick-zone-creator.png',fullPage:true});
  await page.locator('#publish-lock').click();await expect(page.locator('#lock-game .lock-zone')).toHaveCount(0);
  await expect(guide).toBeHidden();
});

test('mouse hover aims without clicking; short clicks reset and a sustained mouse hold opens the lock',async({page})=>{
  await lockPage(page);
  const surface=page.locator('#lock-game .lock-surface'),slider=page.locator('#lock-game .lock-angle'),box=(await surface.boundingBox())!;
  const aim=async(angle:number)=>{const radians=angle*Math.PI/180,radius=Math.min(box.width,box.height)*.3;await page.mouse.move(box.x+box.width/2+Math.sin(radians)*radius,box.y+box.height/2-Math.cos(radians)*radius);};
  await aim(40);await expect(slider).toHaveValue('40');await expect(page.locator('#revision')).toHaveText('Revision 0');
  const angle=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).lockSecret.sweetSpot as number);
  await aim(angle);await page.mouse.down();
  await expect.poll(()=>page.locator('#lock-game').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--lock-turn')))).toBeGreaterThan(0);
  await expect(page.locator('#success')).toBeHidden();
  // Captured pointer release outside the face must stop further tension.
  await page.mouse.move(box.x-10,box.y-10);await page.mouse.up();
  await expect(page.locator('#lock-game')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>page.locator('#lock-game').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--lock-turn')))).toBe(0);
  const revision=await page.locator('#revision').innerText();await page.waitForTimeout(500);await expect(page.locator('#revision')).toHaveText(revision);
  await aim(angle);const start=Date.now();await page.mouse.down();await expect(page.locator('#success')).toBeVisible({timeout:10000});await page.mouse.up();
  expect(Date.now()-start).toBeGreaterThanOrEqual(1700);await expect(page.locator('.lock-condition meter')).toHaveAttribute('value','100');
});

test('binding gives more visible travel near the zone and releasing stops pick damage',async({page})=>{
  await lockPage(page);
  const angle=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).lockSecret.sweetSpot as number);
  const sample=async(value:number)=>{
    await page.locator('.lock-angle').fill(String(value));await page.locator('#lock-game .lock-surface').focus();await page.keyboard.down('Space');
    await expect(page.locator('#lock-game')).toHaveClass(/is-binding/);
    const turn=await page.locator('#lock-game').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--lock-turn')));
    await page.keyboard.up('Space');await expect(page.locator('#lock-game')).toHaveAttribute('aria-busy','false');return turn;
  };
  const far=await sample(angle>0?-90:90),near=await sample(angle+(angle>0?-6:6));expect(near).toBeGreaterThan(far+50);
  await expect(page.locator('#success')).toBeHidden();const health=await page.locator('.lock-condition meter').getAttribute('value');
  await page.waitForTimeout(500);await expect(page.locator('.lock-condition meter')).toHaveAttribute('value',health!);
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

test('initial tension reacts before a slow acknowledgement and release does not replay it',async({page})=>{
  await page.addInitScript(()=>{
    const timeout=window.setTimeout.bind(window);
    window.setTimeout=((callback:TimerHandler,delay?:number,...args:unknown[])=>timeout(callback,delay===90?800:delay,...args)) as typeof window.setTimeout;
  });
  await lockPage(page);
  await page.locator('.lock-angle').fill('0');await page.locator('#lock-game .lock-surface').focus();await page.keyboard.down('Space');
  await expect.poll(()=>page.locator('#lock-game').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--lock-turn'))),{timeout:400}).toBeGreaterThan(0);
  await expect(page.locator('#revision')).toHaveText('Revision 0');await expect(page.locator('#success')).toBeHidden();
  await page.keyboard.up('Space');await expect.poll(()=>page.locator('#lock-game').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--lock-turn')))).toBe(0);
  await expect(page.locator('#revision')).toHaveText('Revision 1');await expect(page.locator('#lock-game')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>page.locator('#lock-game').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--lock-turn')))).toBe(0);
  await expect(page.locator('.lock-condition meter')).toHaveAttribute('value','100');
});

test('switching to the creator cancels a held lock even while Space stays down',async({page})=>{
  await lockPage(page);await page.locator('.lock-angle').fill('-90');await page.locator('#lock-game .lock-surface').focus();await page.keyboard.down('Space');
  await page.locator('#open-setup').click();await expect(page.locator('#puzzle-picker-title')).toBeVisible();await expect(page.locator('#lock-game')).toHaveAttribute('aria-busy','false');
  const revision=await page.locator('#revision').innerText();await page.waitForTimeout(650);await expect(page.locator('#revision')).toHaveText(revision);await page.keyboard.up('Space');
});
test('puzzle picker can go back and open the existing pipe builder; lock UI respects reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#open-setup').click();
  await page.screenshot({path:'docs/evidence/puzzle-type-picker.png',fullPage:true});
  await page.locator('#choose-lockpick').click();await page.locator('.puzzle-types-back').click();await page.locator('#choose-pipes').click();
  await expect(page.locator('#draft-board button')).toHaveCount(25);
  await page.locator('.puzzle-types-back').click();await page.locator('#choose-lockpick').click();await page.locator('#publish-lock').click();
  await expect(page.locator('#lock-game .lock-cylinder')).toHaveCSS('transition-duration','0s');
});
