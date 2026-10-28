import {test,expect} from '@playwright/test';

test('hostile embedding cannot initialize the extension or read private storage',async({page})=>{
  const localBase=test.info().project.use.baseURL!;
  const extension='https://arcane-pipes.test';
  await page.route(extension+'/**',async route=>{const url=new URL(route.request().url());await route.fulfill({response:await page.request.get(new URL(url.pathname+url.search,localBase).href)});});
  await page.route('https://untrusted.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><h1>Security test host</h1></body></html>'}));
  await page.addInitScript(()=>{
    const original=Storage.prototype.getItem;
    Storage.prototype.getItem=function(key){if(key.includes('arcane'))document.documentElement.dataset.privateRead='yes';return original.call(this,key);};
  });
  await page.goto('https://untrusted.test/');
  await page.evaluate(extension=>{
    for(const [id,host]of [['hostile','https://untrusted.test'],['forged','https://www.owlbear.rodeo']]){
      const frame=document.createElement('iframe');frame.id=id;frame.src=extension+'/index.html?obrref='+encodeURIComponent(btoa(host+' security-room'));
      frame.onload=()=>frame.contentWindow!.postMessage({id:'OBR_READY',data:{ref:id,userId:'fake-gm'}},extension);document.body.append(frame);
    }
  },extension);
  const hostile=page.frameLocator('#hostile'),forged=page.frameLocator('#forged');
  await expect(hostile.locator('body')).toContainText('Untrusted embedding was blocked');
  await expect(forged.locator('#waiting-screen')).toBeVisible();
  // Flush message delivery, then inspect application initialization directly.
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,300)));
  for(const frame of [hostile,forged]){
    await expect(frame.locator('html')).not.toHaveAttribute('data-private-read','yes');
  }
  await expect(hostile.locator('#authoring')).toHaveCount(0);
  await expect(forged.locator('#authoring')).toBeEmpty();
});

test('production document blocks inline script and external connections',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const script=document.createElement('script');script.textContent='document.body.dataset.inlineExecuted="yes"';document.body.append(script);
  });
  await expect(page.locator('body')).not.toHaveAttribute('data-inline-executed','yes');
  expect(await page.evaluate(async()=>{try{await fetch('https://untrusted.test/security-canary');return false;}catch{return true;}})).toBe(true);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content','no-referrer');
});

test('a sibling window with the trusted origin cannot spoof the SDK parent',async({page})=>{
  const localBase=test.info().project.use.baseURL!,extension='https://arcane-pipes.test';
  await page.route(extension+'/**',async route=>{const url=new URL(route.request().url());await route.fulfill({response:await page.request.get(new URL(url.pathname+url.search,localBase).href)});});
  await page.route('https://www.owlbear.rodeo/**',route=>route.fulfill({contentType:'text/html',body:'<html><body>Intercepted security host</body></html>'}));
  await page.goto('https://www.owlbear.rodeo/security-host');
  await page.evaluate(extension=>{
    const victim=document.createElement('iframe');victim.id='victim';victim.src=extension+'/index.html?obrref='+encodeURIComponent(btoa(location.origin+' security-room'));document.body.append(victim);
    const sibling=document.createElement('iframe');sibling.id='sibling';sibling.src=location.origin+'/security-sibling';document.body.append(sibling);
  },extension);
  const victim=page.frameLocator('#victim');await expect(victim.locator('#waiting-screen')).toBeVisible();
  await page.frameLocator('#sibling').locator('body').evaluate((_,extension)=>{
    (parent.document.querySelector('#victim') as HTMLIFrameElement).contentWindow!.postMessage({id:'OBR_READY',data:{ref:'forged',userId:'fake-gm'}},extension);
  },extension);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,300)));
  await expect(victim.locator('#waiting-screen')).toBeVisible();await expect(victim.locator('#authoring')).toBeEmpty();
});
