import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build,resolveConfig } from 'vite';

test('build disables environment files, client environment exposure and source maps',async()=>{
  const config=await resolveConfig({},'build');
  assert.equal(config.envDir,false);assert.deepEqual(config.envPrefix,[]);assert.equal(config.build.sourcemap,false);
});

test('source manifest routes work with Owlbear origin-prefix URL resolution', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.action, undefined, 'Puzzle entry belongs to tokens, not a room-wide action');
  for (const path of [manifest.icon, manifest.background_url]) {
    assert.ok(path.startsWith('/'), `Owlbear needs an origin-relative path: ${path}`);
    assert.equal(new URL(`http://localhost:4173${path}`).origin, 'http://localhost:4173');
  }
});

test('subpath production build emits manifest routes under the deployment base', async () => {
  const result = await build({ base: '/puzzles-and-perils/', logLevel: 'silent', build: { write: false } });
  const bundles = Array.isArray(result) ? result : [result];
  const output = bundles.flatMap(bundle => 'output' in bundle ? bundle.output : []);
  const asset = output.find(item => item.fileName === 'manifest.json');
  assert.ok(asset && asset.type === 'asset');
  const manifest = JSON.parse(String(asset.source));
  assert.equal(manifest.icon, '/puzzles-and-perils/icon.svg');
  assert.equal(manifest.action, undefined);
  assert.equal(manifest.background_url, '/puzzles-and-perils/background.html');
  for (const name of ['index.html', 'background.html']) {
    const html = output.find(item => item.fileName === name);
    assert.ok(html && html.type === 'asset');
    assert.match(String(html.source), /\/puzzles-and-perils\/assets\//);
  }
});
