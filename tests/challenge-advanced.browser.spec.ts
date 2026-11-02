import {test,expect,type Page} from '@playwright/test';
import {reflectAxis} from '../src/core/challenge-rules.ts';
import {circularDistance,type ChallengeKind} from '../src/core/challenges.ts';
import type {PrivatePreparation} from '../src/core/state.ts';
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!) as PrivatePreparation);
async function creator(page:Page,kind:ChallengeKind){await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-'+kind).click();}
async function rule(page:Page,key:string,value:string|number|boolean){const el=page.locator(`[data-rule="${key}"]`);if(typeof value==='boolean')await el.setChecked(value);else if(await el.evaluate(e=>e.tagName==='SELECT'))await el.selectOption(String(value));else{await el.fill(String(value));await el.dispatchEvent('change');}}
async function publish(page:Page){await page.locator('#publish-challenge').click();await expect(page.locator('#challenge-game')).toBeVisible();await expect.poll(async()=>(await saved(page)).state.challenge?.version).toBe(2);}
async function action(page:Page,selector:string,button:'left'|'right'='left'){const rev=(await saved(page)).state.revision;await page.locator('#challenge-game '+selector).click({button});await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(rev);}
async function tune(page:Page,index:number,value:number){if((await saved(page)).state.challenge!.values[index]===value)return;await page.locator(`#challenge-game [data-dial="${index}"]`).fill(String(value));await expect.poll(async()=>(await saved(page)).state.challenge!.values[index]).toBe(value);}
async function screen(page:Page,x:number,y:number){return page.locator('#challenge-game svg').evaluate((svg:SVGSVGElement,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM()!);return{x:q.x,y:q.y};},{x,y});}
async function focusSurface(page:Page){await page.locator('#challenge-game .challenge-surface').evaluate((el:HTMLElement)=>{el.tabIndex=0;el.focus();});}

test('five receivers are visible together and all must align before one lock-in',async({page})=>{
  await page.setViewportSize({width:1600,height:1100});await creator(page,'waveform');await page.locator('#challenge-count').selectOption('5');await publish(page);await expect(page.locator('#challenge-game [data-receiver]')).toHaveCount(5);
  const target=(await saved(page)).state.challenge!.target;
  for(let i=0;i<16;i++){if(i%4===3)continue;await tune(page,i,target[i]);}
  await action(page,'[data-check]');await expect(page.locator('#success')).toBeHidden();await expect(page.locator('#challenge-game [data-receiver]')).toHaveCount(5);
  for(let i=16;i<20;i++){if(i%4===3)continue;await tune(page,i,target[i]);}
  await expect(page.locator('#challenge-game .receiver-aligned')).toHaveCount(5);await page.screenshot({path:'docs/evidence/advanced-receiver-stack.png',fullPage:true});
  await action(page,'[data-check]');await expect(page.locator('#success')).toBeVisible();await page.reload();await expect(page.locator('#success')).toBeVisible();await page.locator('#edit-puzzle').click();await expect(page.locator('#challenge-count')).toHaveValue('5');
});
test('spectral goal, selected fragments and result use identical column positions',async({page})=>{
  await creator(page,'spectrum');await page.locator('#publish-challenge').click();const p=await saved(page);for(const i of p.challengeSecret!.answers[0])await action(page,`.fragment-bank [data-choice="${i}"]`);
  const positions=await page.locator('#challenge-game .spectral-workbench .spectral-plot').evaluateAll(plots=>plots.map(svg=>Array.from(svg.querySelectorAll('.spectral-axis-label')).map(label=>{const p=new DOMPoint(Number(label.getAttribute('x')),0).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);return p.x;})));
  expect(positions.length).toBe(5);for(const row of positions)for(let i=0;i<8;i++)expect(Math.abs(row[i]-positions[0][i])).toBeLessThan(1);
  await page.screenshot({path:'docs/evidence/advanced-spectral-alignment.png',fullPage:true});await action(page,'[data-check]');await expect(page.locator('#success')).toBeVisible();
});
test('hex board stays within its hexagonal frame and rotations continue past a full turn',async({page})=>{
  await creator(page,'hex');await page.locator('#challenge-difficulty').selectOption('hard');await publish(page);await expect(page.locator('#challenge-game .hex-tile')).toHaveCount(19);await expect(page.locator('#challenge-game .hex-board-boundary')).toBeVisible();
  const tile=page.locator('#challenge-game [data-choice="0"]'),channels=tile.locator('.hex-channels'),before=Number((await channels.getAttribute('style'))!.match(/rotate\(([-\d.]+)/)![1]),moves=(await saved(page)).state.challenge!.moves;
  for(let i=0;i<7;i++)await tile.dispatchEvent('click');await expect.poll(async()=>(await saved(page)).state.challenge!.moves).toBe(moves+7);
  await expect.poll(()=>channels.evaluate(el=>Number((el as HTMLElement).style.transform.match(/rotate\(([-\d.]+)/)![1]))).toBe(before+420);
  await action(page,'[data-choice="0"]','right');await expect.poll(()=>channels.evaluate(el=>Number((el as HTMLElement).style.transform.match(/rotate\(([-\d.]+)/)![1]))).toBe(before+360);
  await page.screenshot({path:'docs/evidence/advanced-hex-boundary.png',fullPage:true});
});
test('timed lockout persists until GM reset, or retries on reopen when configured',async({page})=>{
  for(const retry of ['gm','reopen']){
    await creator(page,'hex');await rule(page,'timerSeconds',2);await rule(page,'retry',retry);await publish(page);
    await expect.poll(async()=>(await saved(page)).state.challenge!.clock!.deadline).toBeGreaterThan(0);await expect(page.locator('#challenge-game')).toHaveClass(/challenge-failed/,{timeout:6000});
    const attempt=(await saved(page)).state.challenge!.attempt;await page.reload();
    if(retry==='gm'){await expect(page.locator('#challenge-game')).toHaveClass(/challenge-failed/);await action(page,'[data-retry]');}
    else await expect.poll(async()=>(await saved(page)).state.challenge!.attempt).toBe(attempt!+1);
    await expect(page.locator('#challenge-game')).not.toHaveClass(/challenge-failed/);
  }
});
test('timing pin settings control count, speed and direction reversal',async({page})=>{
  await creator(page,'rotor');await rule(page,'count',6);await rule(page,'speed',60);await rule(page,'reverse',false);await publish(page);await expect(page.locator('#challenge-game .timing-pin')).toHaveCount(6);
  await expect.poll(()=>page.locator('#challenge-game [data-sweep]').getAttribute('transform')).not.toBeNull();await focusSurface(page);await page.keyboard.press('Space');await expect.poll(async()=>(await saved(page)).state.challenge!.moves).toBe(1);expect((await saved(page)).state.challenge!.rules!.reverse).toBe(false);
  await page.locator('#edit-puzzle').click();await rule(page,'reverse',true);await page.locator('#publish-challenge').click();await focusSurface(page);await page.keyboard.press('Space');await expect.poll(async()=>(await saved(page)).state.challenge!.moves).toBe(1);
  const angle=async()=>Number((await page.locator('#challenge-game [data-sweep]').getAttribute('transform'))!.match(/rotate\(([-\d.]+)/)![1]),before=await angle();await page.waitForTimeout(120);const after=await angle();expect((before-after+360)%360).toBeGreaterThan(0);expect((before-after+360)%360).toBeLessThan(30);
});
test('glyph chain uses all code rings and the GM solution shows the actual ordered code',async({page})=>{
  await creator(page,'glyph');await rule(page,'count',5);await page.locator('.challenge-answer summary').click();await expect(page.locator('.challenge-answer')).toContainText('Ordered code:');await publish(page);await expect(page.locator('#challenge-game [data-choice]')).toHaveCount(5);
  await action(page,'[data-check]');await expect(page.locator('#success')).toBeHidden();const answer=(await saved(page)).challengeSecret!.answers[0];for(let i=0;i<answer.length;i++)while((await saved(page)).state.challenge!.values[i]!==answer[i])await action(page,`[data-choice="${i}"]`);await action(page,'[data-check]');await expect(page.locator('#success')).toBeVisible();
});
test('mirror goals randomize on both sides and solve using reflection across the drawn axis',async({page})=>{
  await creator(page,'mirror');await rule(page,'axis',45);await rule(page,'count',8);await expect(page.locator('.challenge-answer')).toHaveCount(0);await publish(page);const c=(await saved(page)).state.challenge!;
  for(const [x,y]of c.pieces){const [rx,ry]=reflectAxis(c.target[0],x,y),p=await screen(page,120+rx*3.6,30+ry*3.6),rev=(await saved(page)).state.revision;await page.mouse.click(p.x,p.y);await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(rev);}
  await expect(page.locator('#success')).toBeVisible();
});
test('orbit uses mouse tracks and keyboard taps/holds without a bottom control panel',async({page})=>{
  test.setTimeout(45000);await creator(page,'orbit');await rule(page,'speed',120);await rule(page,'mistakeLimit',0);await publish(page);await expect(page.locator('#challenge-game .challenge-controls button,#challenge-game .challenge-controls input,#challenge-game .challenge-controls select')).toHaveCount(0);
  const c=(await saved(page)).state.challenge!,tap=c.pieces.findIndex(p=>p[2]===0),hold=c.pieces.findIndex(p=>p[2]>0);
  for(const index of [tap,hold]){const [ring,angle,tail]=c.pieces[index],r=55+ring*125/(c.rules!.count-1),p=await screen(page,300,210-r);await page.mouse.move(p.x,p.y);await focusSurface(page);
    await expect.poll(async()=>{const transform=await page.locator(`#challenge-game [data-orbit="${ring}"]`).getAttribute('transform'),phase=Number(transform!.match(/rotate\(([-\d.]+)/)![1]);return circularDistance(phase+angle,0);},{timeout:15000,intervals:[30]}).toBeLessThan(c.rules!.window-3);
    const rev=(await saved(page)).state.revision;await page.keyboard.down('Space');await page.waitForTimeout(tail?tail/c.rules!.speed*1000:40);await page.keyboard.up('Space');await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(rev);expect((await saved(page)).state.challenge!.used).toContain(index);
  }
  for(let i=0;i<5;i++)await page.keyboard.press('ArrowDown');const before=await page.locator('#challenge-game [data-orbit-gate]').getAttribute('transform');await page.keyboard.press('ArrowUp');await expect(page.locator('#challenge-game [data-orbit-gate]')).not.toHaveAttribute('transform',before!);await page.keyboard.press('ArrowDown');await expect(page.locator('#challenge-game [data-orbit-gate]')).toHaveAttribute('transform',before!);
});
test('stream accepts continuous held quantities and can complete through its moving input gate',async({page})=>{
  test.setTimeout(60000);await creator(page,'sequence');await page.locator('#challenge-difficulty').selectOption('easy');await rule(page,'speed',4);await publish(page);await focusSurface(page);let held=false;
  const until=Date.now()+45000;
  while(Date.now()<until){const c=(await saved(page)).state.challenge!;if(c.opened)break;if(c.failed)throw Error('Stream failed during controlled symbol capture');const position=await page.locator('#challenge-game [data-stream]').evaluate(el=>Math.floor(Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41)/52));const symbol=c.pieces[0][position%c.pieces[0].length],i=c.target.findIndex((n,j)=>j%2===0&&n===symbol)/2,need=i>=0&&Number.isInteger(i)&&c.values[i]<c.target[i*2+1];if(need&&!held){held=true;await page.keyboard.down('Space');}if(!need&&held){held=false;await page.keyboard.up('Space');}await page.waitForTimeout(45);}
  await page.keyboard.up('Space');await expect(page.locator('#success')).toBeVisible();
});
test('snake has visible walls, plain dots, and configured lives that drop on boundary collisions',async({page})=>{
  await creator(page,'worm');await rule(page,'walls',3);await rule(page,'lives',3);await rule(page,'speed',5);await publish(page);
  const wallCount=(await saved(page)).state.challenge!.pieces[0].length;expect(wallCount).toBeGreaterThan(0);await expect(page.locator('#challenge-game .snake-food')).toHaveCount(10);await expect(page.locator('#challenge-game .snake-boundary')).toBeVisible();
  const ids=await page.locator('#challenge-game svg pattern').evaluateAll(nodes=>nodes.map(n=>n.id));for(const id of ids)await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
  await page.screenshot({path:'docs/evidence/advanced-snake-walls.png',fullPage:true});await focusSurface(page);await page.keyboard.press('ArrowUp');await expect.poll(async()=>(await saved(page)).state.challenge!.livesLeft,{timeout:6000}).toBe(2);
  await page.waitForTimeout(400);expect((await saved(page)).state.challenge!.livesLeft).toBe(2);
});
test('receiver dragging survives an acknowledgement for another receiver',async({page})=>{
  await creator(page,'waveform');await page.locator('#challenge-count').selectOption('2');await publish(page);const knob=page.locator('#challenge-game [data-knob="0"]'),handle=await knob.elementHandle(),box=(await knob.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2-20,{steps:5});await tune(page,4,57);
  expect(await handle!.evaluate(el=>el.isConnected)).toBe(true);await page.mouse.up();await expect.poll(async()=>(await saved(page)).state.challenge!.values[0]).toBe(70);expect((await saved(page)).state.challenge!.values[4]).toBe(57);
});
test('GM resetting a moving snake starts a fresh attempt waiting for input',async({page})=>{
  await creator(page,'worm');await rule(page,'walls',0);await rule(page,'speed',1);await publish(page);await focusSurface(page);await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await saved(page)).state.challenge!.values[0]).toBe(27);
  await page.locator('#reset-puzzle').click();await expect.poll(async()=>(await saved(page)).state.challenge!.attempt).toBe(1);await page.waitForTimeout(1200);expect((await saved(page)).state.challenge!.values[0]).toBe(26);
});
