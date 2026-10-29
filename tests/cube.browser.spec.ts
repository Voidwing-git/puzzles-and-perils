import {test,expect} from '@playwright/test';

test('4x4x1 dais creates shallow sides and preserves geometry through edit/save',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();await page.locator('#setup-kind').selectOption('dais');await page.locator('#draft-free').check();
  await expect(page.locator('#draft-cube canvas')).toBeVisible();
  await page.locator('#publish-draft').click();await expect(page.locator('#cube-board canvas')).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state);
  expect(state.cubeDimensions).toEqual({width:4,depth:4,height:1});expect(state.tiles).toHaveLength(32);
  await expect(page.locator('#cube-square option')).toHaveCount(33);
  await expect(page.locator('#cube-square option')).not.toContainText(['front A2']);
  const index=state.tiles.findIndex((tile:{terminal?:string}|null,i:number)=>i<16&&tile&&!tile.terminal);
  await page.locator('#cube-square').selectOption(String(index));await page.locator('#rotate').click();await expect(page.locator('#revision')).toHaveText('Revision 1');
  await page.locator('#cube-reset-view').click();await page.screenshot({path:'docs/evidence/m3b-dais.png'});
  await page.locator('#edit-puzzle').click();await expect(page.locator('#setup-kind')).toHaveValue('dais');await page.locator('#publish-draft').click();
  await expect(page.locator('#cube-square option')).toHaveCount(33);expect(errors).toEqual([]);
});

for(const free of [false,true])test(`cube inspection preserves artwork and enabled controls; free play ${free}`,async({page})=>{
  await page.addInitScript(()=>{
    const state=window as typeof window&{cubeImageLoads:number;disabledDuringSelection:boolean[]};state.cubeImageLoads=0;state.disabledDuringSelection=[];
    const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src')!;
    Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value:string){if(value.startsWith('data:image/svg+xml'))state.cubeImageLoads++;descriptor.set!.call(this,value);}});
  });
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();await page.locator('#setup-kind').selectOption('cube');
  await page.locator('#draft-free').setChecked(free);await page.locator('#publish-draft').click();
  const indices=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.tiles.flatMap((tile:{terminal?:string}|null,index:number)=>tile&&!tile.terminal?[index]:[]));
  await page.locator('#cube-square').selectOption(String(indices[0]));await expect(page.locator('#rotate')).toBeEnabled();
  const before=await page.evaluate(()=>{
    const state=window as typeof window&{cubeImageLoads:number;disabledDuringSelection:boolean[]};
    const rotate=document.querySelector<HTMLButtonElement>('#rotate')!;
    new MutationObserver(()=>state.disabledDuringSelection.push(rotate.disabled)).observe(rotate,{attributes:true,attributeFilter:['disabled']});
    return state.cubeImageLoads;
  });
  expect(before).toBeGreaterThan(0);
  for(const index of indices.slice(1,5))await page.locator('#cube-square').selectOption(String(index));
  await expect(page.locator('#rotate')).toBeEnabled();await expect(page.locator('#revision')).toHaveText('Revision 0');
  const after=await page.evaluate(()=>{const state=window as typeof window&{cubeImageLoads:number;disabledDuringSelection:boolean[]};return{loads:state.cubeImageLoads,disabled:state.disabledDuringSelection};});
  expect(after.loads).toBe(before);expect(after.disabled).not.toContain(true);
});

for(const reduced of [false,true])test(`cube double click rotates once and draws animated channel frames; reduced motion ${reduced}`,async({page})=>{
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
  await page.addInitScript(()=>{
    const observed=window as typeof window&{cubeAngles:number[]};observed.cubeAngles=[];
    const rotate=CanvasRenderingContext2D.prototype.rotate;
    CanvasRenderingContext2D.prototype.rotate=function(angle:number){if(this.canvas.width===512&&this.canvas.height===512)observed.cubeAngles.push(angle);return rotate.call(this,angle);};
  });
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();await page.locator('#setup-kind').selectOption('cube');await page.locator('#draft-free').check();await page.locator('#publish-draft').click();
  const index=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.tiles.findIndex((tile:{shape:string;terminal?:string}|null)=>tile?.shape==='elbow'&&!tile.terminal));
  expect(index).toBeGreaterThanOrEqual(0);
  await page.locator('#cube-square').selectOption(String(index));
  const box=(await page.locator('#cube-board canvas').boundingBox())!,local=index%9;
  await page.mouse.dblclick(box.x+box.width/2+(local%3-1)*box.height*.22-box.height*.025,box.y+box.height/2+(Math.floor(local/3)-1)*box.height*.22+box.height*.02);
  await expect(page.locator('#revision')).toHaveText('Revision 1');
  if(!reduced)await expect.poll(()=>page.evaluate(()=>(window as typeof window&{cubeAngles:number[]}).cubeAngles.filter(angle=>Math.abs(angle)>.01).length)).toBeGreaterThan(2);
  else expect(await page.evaluate(()=>(window as typeof window&{cubeAngles:number[]}).cubeAngles.some(angle=>Math.abs(angle)>.01))).toBe(false);
  await expect.poll(()=>page.evaluate(()=>Math.abs((window as typeof window&{cubeAngles:number[]}).cubeAngles.at(-1)??1))).toBe(0);
  await expect(page.locator('#revision')).toHaveText('Revision 1');
});

test('cube creator, orbit selection, authoritative rotation and missing-piece tray',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Make a puzzle',exact:true}).click();await page.locator('#choose-pipes').click();
  await page.locator('#setup-kind').selectOption('cube');
  await expect(page.locator('#draft-cube canvas')).toBeVisible();
  await expect(page.locator('#draft-status')).toContainText('Settings saved privately');
  const canvas=page.locator('#draft-cube canvas');
  const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:8});await page.mouse.up();
  await expect(page.locator('#draft-tray .tray-piece')).toHaveCount(0);
  // Use the cube's actual picking path to remove one visible ordinary piece.
  for(let y=.3;y<.8;y+=.1){for(let x=.3;x<.8;x+=.1){
    if(await page.locator('#draft-tray .tray-piece').count())break;
    await canvas.click({position:{x:box.width*x,y:box.height*y}});
  }if(await page.locator('#draft-tray .tray-piece').count())break;}
  await expect(page.locator('#draft-tray .tray-piece')).toHaveCount(1);
  await page.locator('#draft-label').fill('Cube shard');
  await page.locator('#draft-free').check();
  await page.screenshot({path:'docs/evidence/m3b-cube-creator.png'});
  await page.getByRole('button',{name:'Finalize puzzle',exact:true}).click();
  await expect(page.locator('#cube-board canvas')).toBeVisible();
  await expect(page.locator('#piece-tray .unknown-piece')).toHaveCount(1);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!));
  expect(state.state.cubeFaces).toEqual(['front','right']);
  const index=state.state.tiles.findIndex((tile:{terminal?:string}|null)=>tile&&!tile.terminal);
  await page.locator('#cube-square').selectOption(String(index));
  await expect(page.locator('#selection-title')).toContainText(index<9?'front':'right');
  await page.locator('#rotate').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.revision)).toBe(1);
  await page.locator('#piece-tray .unknown-piece').click();
  await page.getByRole('menuitem',{name:'Give piece to players',exact:true}).click();
  await expect(page.locator('#piece-tray button.tray-piece')).toHaveCount(1);
  await page.locator('#cube-square').selectOption(String(state.withheld[0].index));
  const playBox=(await page.locator('#cube-board canvas').boundingBox())!;
  const local=state.withheld[0].index%9;
  const target={x:playBox.x+playBox.width/2+(local%3-1)*playBox.height*.22-playBox.height*.025,y:playBox.y+playBox.height/2+(Math.floor(local/3)-1)*playBox.height*.22+playBox.height*.02};
  const card=(await page.locator('#piece-tray button.tray-piece').boundingBox())!;
  await page.mouse.move(card.x+card.width/2,card.y+card.height/2);await page.mouse.down();
  await page.mouse.move(target.x,target.y,{steps:10});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.placements?.length)).toBe(1);
  await page.locator('#piece-tray .placed-piece').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state.placements?.length??0)).toBe(0);
  await page.locator('#cube-square').selectOption(String(state.withheld[0].index));await page.locator('#place-piece').click();
  await page.screenshot({path:'docs/evidence/m3b-cube-play.png'});
  expect(errors).toEqual([]);
});

test('touch orbit leaves puzzle state unchanged and explicit rotate works',async({browser})=>{
  const context=await browser.newContext({viewport:{width:900,height:1000},hasTouch:true,isMobile:true});
  try{
    const page=await context.newPage();await page.goto('/');await page.locator('#open-setup').tap();await page.locator('#choose-pipes').click();await page.locator('#setup-kind').selectOption('cube');await page.locator('#draft-free').check();await page.locator('#publish-draft').tap();
    await expect(page.locator('#cube-board canvas')).toBeVisible();
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state);
    const canvas=page.locator('#cube-board canvas');
    await canvas.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:400,clientY:400,button:0,isPrimary:true});
    await canvas.dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:460,clientY:440,button:0,isPrimary:true});
    await canvas.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:460,clientY:440,button:0,isPrimary:true});
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!).state);expect(after).toEqual(before);
    const index=before.tiles.findIndex((tile:{terminal?:string}|null)=>tile&&!tile.terminal);
    await page.locator('#cube-square').selectOption(String(index));await page.locator('#rotate').tap();
    await expect(page.locator('#revision')).toHaveText('Revision 1');
    await expect(page.locator('#rotate')).toHaveAttribute('aria-busy','false');
    const box=(await canvas.boundingBox())!,local=index%9;
    const x=box.x+box.width/2+(local%3-1)*box.height*.22-box.height*.025,y=box.y+box.height/2+(Math.floor(local/3)-1)*box.height*.22+box.height*.02;
    await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);
    await expect(page.locator('#revision')).toHaveText('Revision 2');
  }finally{await context.close();}
});

test('disconnected cube faces block publication until a connecting face is enabled',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Make a puzzle',exact:true}).click();await page.locator('#choose-pipes').click();
  await page.locator('#setup-kind').selectOption('cube');
  await page.locator('#cube-face-settings input[value="top"]').check();
  await page.locator('#cube-face-settings input[value="bottom"]').check();
  await page.locator('#cube-face-settings input[value="right"]').uncheck();
  await page.locator('#cube-face-settings input[value="front"]').uncheck();
  await expect(page.locator('#publish-draft')).toBeDisabled();
  await page.locator('#cube-face-settings input[value="front"]').check();
  await expect(page.locator('#publish-draft')).toBeEnabled();
});
