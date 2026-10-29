import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

async function makeDoor(page:Page){
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-ring-door').click();
  for(let i=0;i<3;i++)await page.locator('#ring-target-'+i).selectOption(String(i));
  await page.locator('#publish-ring-door').click();await expect(page.locator('#ring-door-game')).toBeVisible();
}
async function positions(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.ringDoor.positions as number[]);}
async function openDoor(page:Page){
  const current=await positions(page);
  for(let ring=0;ring<3;ring++)for(let step=0;step<(ring-current[ring]+3)%3;step++){
    await page.locator(`[data-ring-button="${ring}"]`).click();
    await expect(page.locator('#ring-door-game')).toHaveAttribute('aria-busy','false');
  }
}

test('ring door creator publishes private combination, animated rotations and an opening door',async({page})=>{
  await makeDoor(page);await expect(page.locator('#ring-door-game [data-ring-button]')).toHaveCount(3);
  await expect(page.locator('#ring-door-game')).not.toHaveClass(/ring-door-open/);
  await expect(page.locator('#goal-status-panel')).toBeHidden();await expect(page.locator('.inventory-panel')).toBeHidden();
  await page.screenshot({path:'docs/evidence/ring-door-gameplay.png',fullPage:true});
  // Open through the same per-ring controls used by mouse/keyboard players.
  await openDoor(page);await expect(page.locator('#success')).toBeVisible();
  await expect(page.locator('#ring-door-game')).toHaveClass(/ring-door-open/);
  await expect(page.locator('#ring-door-game .ring-door-leaf')).toHaveCSS('transition-duration','1.25s');
  await expect.poll(()=>page.locator('#ring-door-game .ring-door-leaf').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42)).toBeGreaterThan(500);
  await page.screenshot({path:'docs/evidence/ring-door-open.png',fullPage:true});
  await page.reload();await expect(page.locator('#ring-door-game')).toHaveClass(/ring-restored-open/);
  await expect(page.locator('#ring-door-game .ring-door-leaf')).toHaveCSS('transition-duration','0s');
  await page.locator('#edit-puzzle').click();for(let i=0;i<3;i++)await expect(page.locator('#ring-target-'+i)).toHaveValue(String(i));
});

test('ring hit regions rotate visibly and spectators cannot move the door',async({page})=>{
  await makeDoor(page);const before=await positions(page);
  const art=page.locator('#ring-door-game .ring-door-art'),box=(await art.boundingBox())!;
  // Bottom of the outer annulus is unobstructed by the two inner annuli.
  await page.mouse.click(box.x+box.width/2,box.y+box.height*(320+203)/660);
  await expect(page.locator('#ring-door-game')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>positions(page)).toEqual([(before[0]+1)%3,before[1],before[2]]);
  await expect(page.locator('#ring-door-game .door-ring[data-ring="0"]')).toHaveCSS('transition-duration','0.36s');
  await page.locator('#reset-puzzle').click();await expect(page.locator('#ring-door-game')).not.toHaveClass(/ring-door-open/);
  await page.locator('#viewer').selectOption('spectator');
  for(const button of await page.locator('#ring-door-game [data-ring-button]').all())await expect(button).toBeDisabled();
  const revision=await page.locator('#revision').innerText();await page.mouse.click(box.x+box.width/2,box.y+box.height*(320+145)/660);await expect(page.locator('#revision')).toHaveText(revision);
});

test('ring opening respects reduced motion and reset returns to the starting combination',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await makeDoor(page);const start=await positions(page);
  await openDoor(page);await expect(page.locator('#ring-door-game .ring-door-leaf')).toHaveCSS('transition-duration','0s');
  await page.locator('#reset-puzzle').click();await expect(page.locator('#ring-door-game')).not.toHaveClass(/ring-door-open/);
  await expect.poll(()=>positions(page)).toEqual(start);
});
