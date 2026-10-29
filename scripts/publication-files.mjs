import fs from 'node:fs';
import path from 'node:path';

export const rootFiles=['package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','background.html','.gitignore','README.md','SECURITY.md','THIRD_PARTY_NOTICES.txt'];
export function allowedSource(file){
  if(rootFiles.includes(file))return true;
  if(file==='public/icon.svg'||file==='public/manifest.json')return true;
  if(/^public\/previews\/(?:channels|lockpick|ring-door|terminal|spectrum|waveform|hex|rotor|glyph|mirror|orbit|sequence|worm)\.png$/.test(file))return true;
  if(/^src\/[A-Za-z0-9_./-]+\.(?:ts|css)$/.test(file))return true;
  if(/^tests\/[A-Za-z0-9_.-]+\.(?:ts|mjs)$/.test(file))return true;
  if(/^scripts\/[A-Za-z0-9_.-]+\.mjs$/.test(file))return true;
  return ['.github/workflows/verify.yml','.github/workflows/pages.yml'].includes(file);
}
export function allowedSite(file){return ['index.html','background.html','manifest.json','icon.svg','.nojekyll','THIRD_PARTY_NOTICES.txt','RELEASE-INVENTORY.json'].includes(file)||/^assets\/[A-Za-z0-9_-]+\.(?:js|css)$/.test(file)||/^previews\/(?:channels|lockpick|ring-door|terminal|spectrum|waveform|hex|rotor|glyph|mirror|orbit|sequence|worm)\.png$/.test(file);}
export function walk(root,prefix=''){
  if(fs.lstatSync(root).isSymbolicLink()||!fs.lstatSync(root).isDirectory())throw new Error('Publication roots must be real directories.');
  const files=[];
  for(const entry of fs.readdirSync(path.join(root,prefix),{withFileTypes:true})){
    const relative=(prefix?prefix+'/':'')+entry.name;
    if(entry.isSymbolicLink())throw new Error('Symbolic links are not permitted in a publication tree.');
    if(entry.isDirectory())files.push(...walk(root,relative));else if(entry.isFile())files.push(relative);else throw new Error('Unsupported publication entry.');
  }
  return files.sort();
}
export function sourceFiles(root){
  const files=[...rootFiles];
  for(const dir of ['src','public','tests','scripts','.github'])files.push(...walk(path.join(root,dir)).map(file=>dir+'/'+file));
  for(const file of files)if(!allowedSource(file)||!fs.lstatSync(path.join(root,file)).isFile())throw new Error('Unexpected or missing source publication file: '+file);
  return [...new Set(files)].sort();
}
