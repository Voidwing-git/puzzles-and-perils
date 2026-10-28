import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceFiles,walk} from './publication-files.mjs';
import {auditTree} from './privacy-audit.mjs';
import {zipStore,inspectZip} from './zip-store.mjs';
import {spawnSync} from 'node:child_process';

const workspace=fs.realpathSync(process.cwd());
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--base'))throw Error('Use --base followed by the Pages path.');
const base=args[1]??'/puzzles-and-perils/';
if(!/^\/(?:[A-Za-z0-9_.-]+\/)*$/.test(base)||base.split('/').some(segment=>segment==='.'||segment==='..'))throw Error('Use an origin-relative Pages base ending in a slash.');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(pkg.version))throw Error('Invalid release version.');
const manifest=JSON.parse(fs.readFileSync('public/manifest.json','utf8'));if(pkg.version!==manifest.version)throw Error('Package and manifest versions must match.');
const output=path.join(workspace,'.release'),artifacts=path.join(workspace,'artifacts');
for(const root of [output,artifacts]){fs.mkdirSync(root,{recursive:true});if(fs.lstatSync(root).isSymbolicLink()||!fs.realpathSync(root).startsWith(workspace+path.sep))throw Error('Unsafe output directory.');}
// A failed recheck must not leave an older candidate labelled ready.
for(const file of [`puzzles-and-perils-${pkg.version}-source.zip`,`puzzles-and-perils-${pkg.version}-pages.zip`,'release-review.json']){
  const target=path.join(artifacts,file);
  if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||!fs.lstatSync(target).isFile())throw Error('Unsafe artifact destination.');fs.unlinkSync(target);}
}
function clean(name){
  const target=path.resolve(output,name);
  // Recursive deletion is restricted to these two generated, verified paths.
  if(!['pages','repository'].includes(name)||path.dirname(target)!==output)throw Error('Unsafe cleanup target.');
  if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||!fs.realpathSync(target).startsWith(output+path.sep))throw Error('Unsafe cleanup target.');fs.rmSync(target,{recursive:true});}
  return target;
}
const repository=clean('repository'),pages=clean('pages');fs.mkdirSync(repository,{recursive:true});
for(const file of sourceFiles(workspace)){const target=path.join(repository,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(workspace,file),target);}
await build({base,logLevel:'warn',build:{outDir:pages,emptyOutDir:false,sourcemap:false}});
fs.copyFileSync('THIRD_PARTY_NOTICES.txt',path.join(pages,'THIRD_PARTY_NOTICES.txt'));fs.writeFileSync(path.join(pages,'.nojekyll'),'');
const files=walk(pages).map(file=>{const data=fs.readFileSync(path.join(pages,file));return{path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};});
fs.writeFileSync(path.join(pages,'RELEASE-INVENTORY.json'),JSON.stringify({version:pkg.version,base,files},null,2));
for(const [root,mode]of [[repository,'source'],[pages,'site']]){const report=auditTree(root,mode);if(report.findings.length){console.log(JSON.stringify(report,null,2));throw Error('Privacy audit blocked release packaging.');}}
for(const [root,mode]of [[repository,'source'],[pages,'site']]){const scan=spawnSync(process.execPath,['scripts/security-check.mjs',root,mode],{encoding:'utf8'});if(scan.status!==0){console.log(scan.stdout);throw Error('Secret scanner blocked release packaging.');}}
const archiveReports=[];
for(const [root,kind]of [[repository,'source'],[pages,'pages']]){
  const target=path.join(artifacts,`puzzles-and-perils-${pkg.version}-${kind}.zip`);if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('Unsafe archive destination.');
  zipStore(root,target);const entries=inspectZip(target),expected=walk(root);
  if(entries.map(e=>e.name).join('\n')!==expected.join('\n'))throw Error('Archive contents differ from reviewed tree.');
  for(const entry of entries)if(!entry.data.equals(fs.readFileSync(path.join(root,entry.name))))throw Error('Archive file differs from reviewed content.');
  archiveReports.push({archive:path.basename(target),bytes:fs.statSync(target).size,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),files:entries.map(e=>e.name)});
}
fs.writeFileSync(path.join(artifacts,'release-review.json'),JSON.stringify({version:pkg.version,base,archives:archiveReports},null,2));
const archiveScan=spawnSync(process.execPath,['scripts/security-check.mjs',artifacts,'archives'],{encoding:'utf8'});
if(archiveScan.status!==0){console.log(archiveScan.stdout);throw Error('Final archive security scan failed. Do not publish these artifacts.');}
console.log(JSON.stringify({version:pkg.version,base,sourceFiles:walk(repository).length,siteFiles:walk(pages).length,archives:archiveReports.map(({archive,bytes,sha256})=>({archive,bytes,sha256}))},null,2));
