import assert from 'node:assert/strict';
import {test} from 'node:test';
import {trustedHost} from '../src/security/host-guard.ts';
import {tileArtwork} from '../src/ui/tile.ts';
import {createFixture} from '../src/core/fixtures.ts';
import {projectPublic} from '../src/core/projection.ts';

test('embedding reference accepts only exact official HTTPS hosts and a room',()=>{
  for(const host of ['https://www.owlbear.rodeo','https://owlbear.rodeo'])assert.equal(trustedHost(btoa(host+' test-room')),host);
  for(const host of ['http://www.owlbear.rodeo','https://www.owlbear.rodeo.evil.test','https://evil.test','https://www.owlbear.rodeo/','https://www.owlbear.rodeo:444'])assert.equal(trustedHost(btoa(host+' test-room')),null);
  for(const ref of [null,'malformed',btoa('https://www.owlbear.rodeo'),btoa('https://www.owlbear.rodeo '),btoa('https://www.owlbear.rodeo room extra'),'a'.repeat(2049)])assert.equal(trustedHost(ref),null);
});
test('SVG coordinates are text even when metadata contains markup',()=>{
  const payload='</text><script>alert("test")</script>&\'';
  for(const tile of [null,{shape:'straight' as const,rotation:0 as const}]){
    const svg=tileArtwork(tile,payload,false);
    assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;/text&gt;'));assert.ok(svg.includes('&quot;test&quot;'));assert.ok(svg.includes('&amp;&apos;'));
  }
});
test('public projection drops unknown dimension properties and private notes',()=>{
  const p=createFixture('broken-conduit','projection-audit');
  p.state.cubeDimensions={width:4,depth:4,height:1,privateNote:'private-canary'} as any;
  p.withheld[0].notes='private-canary';
  assert.deepEqual(projectPublic(p).cubeDimensions,{width:4,depth:4,height:1});
  assert.ok(!JSON.stringify(projectPublic(p)).includes('private-canary'));
});
