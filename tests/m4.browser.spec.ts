import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('M4 undo, pause, backup review, reload and restore through real local controls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.locator('[data-index="6"]').click();await page.locator('#rotate').click();await expect(page.locator('#revision')).toHaveText('Revision 1');
  await page.locator('#undo-puzzle').click();await expect(page.locator('#revision')).toHaveText('Revision 2');
  await expect(page.locator('[data-index="6"]')).toHaveAttribute('aria-label',/west and north/);
  await page.locator('#pause-puzzle').click();await expect(page.locator('#active-player')).toHaveText('Paused');await expect(page.locator('#rotate')).toBeDisabled();
  await page.locator('#save-recovery>summary').click();
  await expect(page.locator('#backup-private')).toBeVisible();
  await expect.poll(()=>page.locator('#backup-private').evaluate(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return button===hit||button.contains(hit);})).toBe(true);
  const saving=page.waitForEvent('download');await page.locator('#backup-private').click();const save=await readFile((await(await saving).path())!,'utf8');
  expect(JSON.parse(save).version).toBe(1);expect(JSON.parse(save).preparation.state.paused).toBe(true);
  await page.reload();await expect(page.locator('#active-player')).toHaveText('Paused');await expect(page.locator('#revision')).toHaveText('Revision 3');
  await page.locator('#pause-puzzle').click();await expect(page.locator('#revision')).toHaveText('Revision 4');
  await page.locator('#save-recovery>summary').click();
  const before=await page.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'));
  await page.locator('#import-private').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});
  await expect(page.locator('#feedback')).toContainText('Invalid');expect(await page.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'))).toBe(before);
  await page.locator('#import-private').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(save)});
  await expect(page.locator('#restore-review')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'))).toBe(before);
  await page.locator('#restore-save').click();await expect(page.locator('#active-player')).toHaveText('Paused');await expect(page.locator('#feedback')).toHaveText('Private backup restored.');
  await page.locator('#undo-puzzle').click();await expect(page.locator('#active-player')).not.toHaveText('Paused');
  await expect(page.locator('#revision')).toHaveText('Revision 4');
  expect(errors).toEqual([]);
  if(!(await page.locator('#import-private').isVisible()))await page.locator('#save-recovery>summary').click();
  await page.locator('#import-private').setInputFiles({name:'stale-review.json',mimeType:'application/json',buffer:Buffer.from(save)});
  await page.locator('#pause-puzzle').click();await expect(page.locator('#active-player')).toHaveText('Paused');
  if(!(await page.locator('#restore-save').isVisible()))await page.locator('#save-recovery>summary').click();
  await page.locator('#restore-save').click();await expect(page.locator('#feedback')).toContainText('board changed after this backup');
});

test('M4 private/public backup separation and restore retain missing pieces and their notes',async({page})=>{
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await page.locator('#draft-label').fill('M4 secret discovery');await page.locator('#draft-notes').fill('GM hidden notes');
  await page.locator('#draft-free').check();await page.locator('#publish-draft').click();
  await expect(page.locator('#piece-tray .unknown-piece')).toHaveCount(1);
  await page.locator('#save-recovery>summary').click();
  let saving=page.waitForEvent('download');await page.locator('#backup-public').click();const publicText=await readFile((await(await saving).path())!,'utf8');
  for(const secret of ['M4 secret discovery','GM hidden notes','solution','seed','withheld','history'])expect(publicText).not.toContain(secret);
  saving=page.waitForEvent('download');await page.locator('#backup-private').click();const privateText=await readFile((await(await saving).path())!,'utf8');
  expect(privateText).toContain('GM hidden notes');
  await page.locator('#piece-tray .unknown-piece').click();await page.getByRole('menuitem',{name:'Give piece to players',exact:true}).click();await expect(page.locator('#inventory option')).toHaveCount(1);
  if(!(await page.locator('#import-private').isVisible()))await page.locator('#save-recovery>summary').click();
  await page.locator('#import-private').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(privateText)});await page.locator('#restore-save').click();
  await expect(page.locator('#piece-tray .unknown-piece')).toHaveCount(1);await expect(page.locator('#inventory option')).toHaveCount(0);
  await page.locator('#piece-tray .unknown-piece').click();await page.getByRole('menuitem',{name:'Restore piece',exact:true}).click();await expect(page.locator('#piece-tray .unknown-piece')).toHaveCount(0);
});

test('M4 damaged local save fails closed and leaves import recovery available',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('arcane-pipes:private:m3:local:active','{"damaged":true}'));
  await page.goto('/');await expect(page.locator('#puzzle-title')).toHaveText('Recovery required');await expect(page.locator('#feedback')).toContainText('Local save unavailable');
  await expect(page.locator('#pause-puzzle')).toBeDisabled();
  await page.locator('#save-recovery>summary').click();await expect(page.locator('#import-private')).toBeEnabled();await expect(page.locator('#backup-private')).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'))).toBe('{"damaged":true}');
});

test('M4 private backup restores hidden information in an independent browser profile',async({page,browser})=>{
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();await page.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await page.locator('#draft-label').fill('Portable discovery');await page.locator('#draft-notes').fill('Portable GM notes');await page.locator('#publish-draft').click();
  await page.locator('#save-recovery>summary').click();const downloading=page.waitForEvent('download');await page.locator('#backup-private').click();const backup=await readFile((await(await downloading).path())!,'utf8');
  const original=await page.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'));
  const context=await browser.newContext({baseURL:new URL(page.url()).origin});
  try{
    const other=await context.newPage();await other.goto('/');expect(await other.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'))).toBeNull();
    await other.locator('#save-recovery>summary').click();await other.locator('#import-private').setInputFiles({name:'portable.json',mimeType:'application/json',buffer:Buffer.from(backup)});await other.locator('#restore-save').click();
    await expect(other.locator('#piece-tray .unknown-piece')).toHaveCount(1);await other.reload();await expect(other.locator('#piece-tray .unknown-piece')).toHaveCount(1);
    await other.locator('#edit-puzzle').click();await other.locator('#draft-tray .tray-piece').click();await expect(other.locator('#draft-notes')).toHaveValue('Portable GM notes');await expect(other.locator('#draft-label')).toHaveValue('Portable discovery');
    expect(await page.evaluate(()=>localStorage.getItem('arcane-pipes:private:m3:local:active'))).toBe(original);
  }finally{await context.close();}
});
