import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectText,isPreview} from '../scripts/privacy-audit.mjs';
import {allowedSource,allowedSite} from '../scripts/publication-files.mjs';
import {zipStore,inspectZip} from '../scripts/zip-store.mjs';

test('only approved gameplay PNGs without metadata can be published',()=>{
  for(const name of ['channels','lockpick','ring-door']){
    const file=`public/previews/${name}.png`,data=fs.readFileSync(file);
    assert.ok(isPreview(file,data));assert.ok(isPreview(`previews/${name}.png`,data));
    assert.equal(isPreview('public/previews/other.png',data),false);
    assert.equal(isPreview(file,Buffer.concat([data,Buffer.from('extra')])),false);
    const chunk=Buffer.alloc(16);chunk.writeUInt32BE(4);chunk.write('tEXt',4);chunk.write('note',8);
    assert.equal(isPreview(file,Buffer.concat([data.subarray(0,33),chunk,data.subarray(33)])),false);
    assert.equal(isPreview(file,data.subarray(0,data.length-1)),false);
  }
});

test('publication allowlists exclude local configs, histories, evidence and source maps',()=>{
  for(const name of ['.env','.env.production','.git/config','docs/evidence/screen.png','profile/Cookies','src/local.json','assets/main.js.map','README.txt']){
    assert.equal(allowedSource(name),false,name);assert.equal(allowedSite(name),false,name);
  }
  assert.ok(allowedSource('src/security/host-guard.ts'));assert.ok(allowedSite('assets/main-test.js'));
});
test('privacy scanner identifies sensitive canaries without returning their values',()=>{
  const examples=[['credential-value','pass'+'word="sensitive-canary"'],['personal-machine-path','C:'+'\\Users\\example-person\\project'],['ipv4-address',[192,0,2,1].join('.')],['email-address','person'+'@example.test'],['personal-account-value','user'+'name="example-person"'],['geographic-value','lati'+'tude=12.345']];
  for(const [rule,value]of examples){const hits=inspectText('example.txt',value);assert.ok(hits.some(hit=>hit.rule===rule),rule);assert.ok(!JSON.stringify(hits).includes(value));}
  assert.equal(inspectText('bundle.js','00.01.02.03.04.05.06.07').length,0);
});
test('release ZIPs are deterministic and contain only relative content without host metadata',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'arcane-zip-test-'));
  try{
    const tree=path.join(root,'tree');fs.mkdirSync(path.join(tree,'assets'),{recursive:true});fs.writeFileSync(path.join(tree,'assets','sample.js'),'example');
    const first=path.join(root,'first.zip'),second=path.join(root,'second.zip');zipStore(tree,first);
    fs.utimesSync(path.join(tree,'assets','sample.js'),new Date(),new Date());zipStore(tree,second);
    assert.deepEqual(fs.readFileSync(first),fs.readFileSync(second));const entries=inspectZip(first);
    assert.deepEqual(entries.map(e=>e.name),['assets/sample.js']);assert.equal(entries[0].data.toString(),'example');
    assert.ok(!fs.readFileSync(first).includes(Buffer.from(root)));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
