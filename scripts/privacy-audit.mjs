import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {walk,allowedSource,allowedSite} from './publication-files.mjs';
import {inspectZip} from './zip-store.mjs';
import {createHash} from 'node:crypto';

// Only the reviewed gameplay previews may be binary. Reject ancillary PNG
// chunks so text, locations, software labels and other metadata cannot ship.
export function isPreview(file,data){
  if(!/^(?:public\/)?previews\/(?:channels|lockpick|ring-door)\.png$/.test(file)||data.length>1024*1024||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;
  let at=8,header=false,pixels=false;
  while(at+12<=data.length){
    const size=data.readUInt32BE(at),kind=data.subarray(at+4,at+8).toString('ascii');
    if(at+size+12>data.length||!['IHDR','IDAT','IEND'].includes(kind))return false;
    if(kind==='IHDR'){if(header||at!==8||size!==13)return false;header=true;const width=data.readUInt32BE(at+8),height=data.readUInt32BE(at+12);if(!width||!height||width>1600||height>1000)return false;}
    if(kind==='IDAT')pixels=true;
    at+=size+12;if(kind==='IEND')return header&&pixels&&size===0&&at===data.length;
  }
  return false;
}

// Report categories and locations only. Never echo matching secrets or context.
export function inspectText(file,text){
  const rules=[
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
    ['credential-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g],
    ['credential-value',/\b(?:password|api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\b["']?\s*[:=]\s*["'][^"'\r\n]{6,}["']/gi],
    ['jwt',/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
    ['personal-machine-path',/(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'<>]+|\/(?:home|Users)\/[A-Za-z0-9_.-]+\/)/g],
    ['ipv4-address',/(?<![A-Za-z0-9_.])(?:\d{1,3}\.){3}\d{1,3}(?![A-Za-z0-9_.])/g],
    ['ipv6-address',/\b(?:[a-f\d]{1,4}:){3,7}[a-f\d]{1,4}\b/gi],
    ['email-address',/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g],
    ['personal-account-value',/\b(?:username|user_name|user_email)\b["']?\s*[:=]\s*["'][^"'\r\n]{2,}["']/gi],
    ['geographic-value',/\b(?:latitude|longitude|street_address|home_address|geo_location)\b["']?\s*[:=]\s*(?:["'][^"']+["']|-?\d{1,3}\.\d+)/gi],
    ['embedded-map',/sourceMappingURL\s*=\s*data:/g],
  ];
  const findings=[];
  for(const[rule,regex]of rules){for(const hit of text.matchAll(regex)){
    // Original dependency notices must retain their public upstream authors.
    if(file==='THIRD_PARTY_NOTICES.txt'&&rule==='email-address')continue;
    findings.push({file,rule,line:text.slice(0,hit.index).split('\n').length});
  }}return findings;
}
export function auditTree(root,mode){
  if(!['source','site'].includes(mode))throw new Error('Choose source or site audit mode.');
  const files=walk(root),findings=[];
  for(const file of files){
    if(!(mode==='source'?allowedSource(file):allowedSite(file)))findings.push({file,rule:'unexpected-publication-file',line:0});
    const data=fs.readFileSync(path.join(root,file));
    if(isPreview(file,data))continue;
    if(data.includes(0))findings.push({file,rule:'unexpected-binary',line:0});
    else findings.push(...inspectText(file,data.toString('utf8')));
  }
  if(mode==='site'){
    for(const name of ['index.html','background.html']){
      const html=fs.readFileSync(path.join(root,name),'utf8');
      if(!html.includes('Content-Security-Policy')||!html.replaceAll('&#39;',"'").includes("script-src 'self'")||!html.includes('no-referrer'))findings.push({file:name,rule:'missing-security-policy',line:0});
    }
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
    if(Object.keys(manifest).some(key=>!['name','version','manifest_version','description','icon','background_url'].includes(key)))findings.push({file:'manifest.json',rule:'unreviewed-manifest-field',line:0});
  }
  return{mode,files:files.length,findings};
}
export function auditArchives(root){
  const review=JSON.parse(fs.readFileSync(path.join(root,'release-review.json'),'utf8'));
  const findings=[],expected=['release-review.json',...review.archives.map(a=>a.archive)].sort();let count=0;
  if(JSON.stringify(walk(root))!==JSON.stringify(expected))throw Error('Unexpected archive-review files.');
  for(const archive of review.archives){
    if(!/^puzzles-and-perils-[\d.]+-(source|pages)\.zip$/.test(archive.archive))throw Error('Invalid archive-review name.');
    const file=path.join(root,archive.archive),data=fs.readFileSync(file);
    if(createHash('sha256').update(data).digest('hex')!==archive.sha256||data.length!==archive.bytes)throw Error('Archive differs from reviewed hash.');
    const entries=inspectZip(file),allow=archive.archive.endsWith('-source.zip')?allowedSource:allowedSite;
    if(JSON.stringify(entries.map(e=>e.name))!==JSON.stringify(archive.files))throw Error('Archive inventory differs.');
    for(const entry of entries){count++;const name=archive.archive+'/'+entry.name;
      if(!allow(entry.name)||entry.name.split('/').includes('..'))findings.push({file:name,rule:'unexpected-publication-file',line:0});
      if(isPreview(entry.name,entry.data))continue;
      if(entry.data.includes(0))findings.push({file:name,rule:'unexpected-binary',line:0});
      else findings.push(...inspectText(entry.name,entry.data.toString('utf8')).map(hit=>({...hit,file:name})));
    }
  }
  return{mode:'archives',files:count,findings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditTree(path.resolve(process.argv[2]??'.release/pages'),process.argv[3]??'site');
  console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;
}
