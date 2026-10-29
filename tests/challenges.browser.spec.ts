import {test,expect,type Page} from '@playwright/test';
import type {PrivatePreparation} from '../src/core/state.ts';
import {challengeCatalog,type ChallengeKind} from '../src/core/challenges.ts';
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('arcane-pipes:private:m3:local:active')!) as PrivatePreparation);
async function make(page:Page,kind:ChallengeKind,count=1){await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-'+kind).click();if(count>1)await page.locator('#challenge-count').selectOption(String(count));await page.locator('#publish-challenge').click();await expect(page.locator('#challenge-game')).toBeVisible();}
async function click(page:Page,selector:string){const revision=(await saved(page)).state.revision;await page.locator('#challenge-game '+selector).click();await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(revision);}
for(const kind of Object.keys(challengeCatalog) as ChallengeKind[])test(`${kind} creator, playable controls, GM solve, restore and read-only spectator`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await make(page,kind);
  await expect(page.locator('.inventory-panel')).toBeHidden();await expect(page.locator('#goal-status-panel')).toBeHidden();
  if(kind==='terminal')await click(page,'[data-choice="'+(await saved(page)).challengeSecret!.answers[0][0]+'"]');
  else if(kind==='hex'){for(let i=1;i<7;i++)while((await saved(page)).state.challenge!.values[i]!==0)await click(page,`[data-choice="${i}"]:not(.spectral-slot)`);}
  else if(kind==='glyph'){const a=(await saved(page)).challengeSecret!.answers[0];for(let pair=0;pair<3;pair++){for(let i=0;i<2;i++)for(let n=0;n<a[pair*2+i];n++)await click(page,`[data-choice="${i}"]`);await click(page,'[data-check]');}}
  else if(kind==='mirror'){
    const c=(await saved(page)).state.challenge!,art=page.locator('#challenge-game svg'),box=(await art.boundingBox())!;
    for(const [x,y]of c.pieces){const rev=(await saved(page)).state.revision;await page.mouse.click(box.x+(120+(c.target[0]===1?x:100-x)*3.6)/600*box.width,box.y+(30+(c.target[0]===0?y:100-y)*3.6)/420*box.height);await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(rev);}
  }else if(kind==='spectrum'){for(const i of (await saved(page)).challengeSecret!.answers[0])await click(page,`[data-choice="${i}"]`);await click(page,'[data-check]');}
  else if(kind==='waveform'){for(let i=0;i<2;i++){const v=(await saved(page)).state.challenge!.target[i],rev=(await saved(page)).state.revision;await page.locator(`[data-dial="${i}"]`).fill(String(v));await page.locator(`[data-dial="${i}"]`).dispatchEvent('change');await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(rev);}await click(page,'[data-check]');}
  else if(kind==='worm'){await click(page,'[data-direction="1"]');await expect.poll(async()=>(await saved(page)).state.challenge!.values[0]).toBe(15);}
  else{
    await page.locator('#challenge-game [data-start]').click();
    const before=kind==='sequence'?await page.locator('#challenge-game [data-stream]').getAttribute('style'):await page.locator(kind==='rotor'?'#challenge-game [data-sweep]':'#challenge-game [data-orbit="0"]').getAttribute('transform');
    await expect.poll(()=>kind==='sequence'?page.locator('#challenge-game [data-stream]').getAttribute('style'):page.locator(kind==='rotor'?'#challenge-game [data-sweep]':'#challenge-game [data-orbit="0"]').getAttribute('transform')).not.toBe(before);
    const revision=(await saved(page)).state.revision;await page.keyboard.down('Space');if(kind!=='rotor')await page.waitForTimeout(160);await page.keyboard.up('Space');await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(revision);
    await page.locator('#challenge-game [data-start]').click();
  }
  if(!['worm','rotor','orbit','sequence'].includes(kind))await expect(page.locator('#success')).toBeVisible();
  await page.locator('#complete-puzzle').click();await expect(page.locator('#success')).toBeVisible();await page.reload();await expect(page.locator('#success')).toBeVisible();
  await page.locator('#reset-puzzle').click();await expect(page.locator('#success')).toBeHidden();await page.locator('#viewer').selectOption('spectator');
  for(const button of await page.locator('#challenge-game button').all())await expect(button).toBeDisabled();
  const rev=(await saved(page)).state.revision;await page.keyboard.press('Space');expect((await saved(page)).state.revision).toBe(rev);
  expect(errors).toEqual([]);
});
test('waveform five signals and spectrum six samples progress and retain their GM count settings',async({page})=>{
  for(const kind of ['waveform','spectrum'] as const){const count=kind==='waveform'?5:6;await make(page,kind,count);
    for(let stage=0;stage<count;stage++){
      if(kind==='spectrum'){for(const n of (await saved(page)).challengeSecret!.answers[0])await click(page,`[data-choice="${n}"]:not(.spectral-slot)`);}
      else for(let i=0;i<2;i++){const v=(await saved(page)).state.challenge!.target[i],rev=(await saved(page)).state.revision;await page.locator(`[data-dial="${i}"]`).fill(String(v));await page.locator(`[data-dial="${i}"]`).dispatchEvent('change');await expect.poll(async()=>(await saved(page)).state.revision).toBeGreaterThan(rev);}
      await click(page,'[data-check]');await expect(page.locator('.challenge-progress')).toHaveText(`${stage+1}/${count}`);
    }
    await page.locator('#edit-puzzle').click();await expect(page.locator('#challenge-count')).toHaveValue(String(count));await page.locator('#publish-challenge').click();await expect(page.locator('#success')).toBeVisible();
  }
});
test('terminal failure waits for GM and bracket tools are consumed once',async({page})=>{
  await make(page,'terminal');const secret=(await saved(page)).challengeSecret!.answers[0][0];const wrong=Array.from({length:12},(_,i)=>i).filter(i=>i!==secret);
  await click(page,'[data-bracket="3"]');await expect(page.locator('#challenge-game [data-bracket="3"]')).toBeDisabled();
  for(const i of wrong.slice(0,4))await click(page,`[data-choice="${i}"]`);await expect(page.locator('.challenge-feedback')).toContainText('GM');
  await click(page,'[data-retry]');await expect(page.locator('.challenge-progress')).toHaveText('4 attempts remaining');await click(page,`[data-choice="${secret}"]`);await expect(page.locator('#success')).toBeVisible();
});
test('wave dials drag immediately and keep keyboard focus after acknowledgement',async({page})=>{
  await make(page,'waveform');const dial=page.locator('[data-knob="0"]'),box=(await dial.boundingBox())!,before=await page.locator('#challenge-game .player-wave').getAttribute('d');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2-20,{steps:5});
  await expect(page.locator('#challenge-game .player-wave')).not.toHaveAttribute('d',before!);expect((await saved(page)).state.revision).toBe(0);await page.mouse.up();await expect.poll(async()=>(await saved(page)).state.challenge!.values[0]).toBe(70);
  await dial.focus();await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await saved(page)).state.challenge!.values[0]).toBe(71);await expect(dial).toBeFocused();
});
