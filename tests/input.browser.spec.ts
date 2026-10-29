import { test, expect } from '@playwright/test';

for(const cube of [false,true])test(`two consecutive double-clicks rotate twice while the first move is pending: cube ${cube}`,async({page})=>{
  await page.goto('/');
  let index=6;
  if(cube){
    await page.locator('#open-setup').click();await page.locator('#setup-kind').selectOption('cube');await page.locator('#draft-free').uncheck();await page.locator('#publish-draft').click();
    index=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.tiles.findIndex((tile:{terminal?:string}|null)=>tile&&!tile.terminal));
    await page.locator('#cube-square').selectOption(String(index));
  }
  const target=page.locator(cube?'#cube-board canvas':`[data-index="${index}"]`),box=(await target.boundingBox())!,local=index%9;
  const x=cube?box.x+box.width/2+(local%3-1)*box.height*.22-box.height*.025:box.x+box.width/2;
  const y=cube?box.y+box.height/2+(Math.floor(local/3)-1)*box.height*.22+box.height*.02:box.y+box.height/2;
  // Native click counts keep increasing during a quick four-click burst.
  for(let clickCount=1;clickCount<=4;clickCount++)await page.mouse.click(x,y,{clickCount,delay:15});
  await expect(page.locator('#revision')).toHaveText('Revision 2');
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
});

test('a failed first rotation cancels buffered rotations instead of retrying them silently',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const timeout=window.setTimeout;
    window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>timeout(handler,delay===90?400:delay,...args)) as typeof window.setTimeout;
    const original=Storage.prototype.setItem;let first=true;
    Storage.prototype.setItem=function(key:string,value:string){
      if(key==='arcane-pipes:private:m3:local:active'&&first){first=false;throw new Error('One failed write');}
      return original.call(this,key,value);
    };
  });
  const box=(await page.locator('[data-index="6"]').boundingBox())!;
  for(let clickCount=1;clickCount<=4;clickCount++)await page.mouse.click(box.x+box.width/2,box.y+box.height/2,{clickCount,delay:10});
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','true');
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#feedback')).toContainText('Private save unavailable');
  await expect(page.locator('#revision')).toHaveText('Revision 0');
  await page.locator('#rotate').click();
  await expect(page.locator('#revision')).toHaveText('Revision 1');
});

for(const cube of [false,true])test(`Space outside board buttons ignores repeats and form controls: cube ${cube}`,async({page})=>{
  await page.goto('/');
  if(cube){
    await page.locator('#open-setup').click();await page.locator('#setup-kind').selectOption('cube');await page.locator('#draft-free').check();await page.locator('#publish-draft').click();
    const index=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.tiles.findIndex((tile:{terminal?:string}|null)=>tile&&!tile.terminal));
    await page.locator('#cube-square').selectOption(String(index));
    const canvas=page.locator('#cube-board canvas'),box=(await canvas.boundingBox())!,local=index%9;
    await page.mouse.click(box.x+box.width/2+(local%3-1)*box.height*.22-box.height*.025,box.y+box.height/2+(Math.floor(local/3)-1)*box.height*.22+box.height*.02);
    await expect(canvas).toBeFocused();
  }else{
    await page.locator('[data-index="6"]').click();await page.locator('#puzzle-title').click();
  }
  const scroll=await page.evaluate(()=>scrollY);
  await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  await expect(page.locator('#revision')).toHaveText('Revision 1');await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
  expect(await page.evaluate(()=>scrollY)).toBe(scroll);
  await page.locator('#viewer').focus();await page.keyboard.press('Space');await expect(page.locator('#revision')).toHaveText('Revision 1');await page.keyboard.press('Escape');
  await page.locator('#open-setup').click();await page.getByText('More options',{exact:true}).click();
  await page.locator('#draft-seed').fill('hello');await page.locator('#draft-seed').press('End');await page.keyboard.press('Space');await expect(page.locator('#draft-seed')).toHaveValue('hello ');
});

test('Space rotates a selected tile once without scrolling or undoing selection', async ({page}) => {
  await page.goto('/');
  const tile = page.locator('[data-index="6"]');
  await tile.click();
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
  const scroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(page.locator('#revision')).toHaveText('Revision 1');
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
  await expect(tile).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await page.keyboard.press('Space');
  await expect(page.locator('#revision')).toHaveText('Revision 2');
  await page.locator('#viewer').selectOption('orin');
  await tile.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#rotate')).toBeDisabled();
  await expect(page.locator('#revision')).toHaveText('Revision 2');
});

test.describe('mobile touch controls', () => {
  test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
  test('tap selects, double-tap rotates exactly once, and the touch Rotate button works', async ({page}) => {
    await page.goto('/');
    const tile = page.locator('[data-index="6"]');
    await tile.tap();
    await expect(tile).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#revision')).toHaveText('Revision 0');
    await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
    // A second tap on that tile forms the double-tap gesture.
    await tile.tap();
    await expect(page.locator('#revision')).toHaveText('Revision 1');
    await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
    await expect(tile).toHaveAttribute('aria-label',/openings north and east/);
    await page.locator('#rotate').tap();
    await expect(page.locator('#revision')).toHaveText('Revision 2');
    await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
    await page.locator('#viewer').selectOption('spectator');
    await tile.tap(); await tile.tap();
    await expect(page.locator('#revision')).toHaveText('Revision 2');
    await expect(page.locator('#rotate')).toBeDisabled();
  });
});
