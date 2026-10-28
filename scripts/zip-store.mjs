import fs from 'node:fs';
import path from 'node:path';
import {walk} from './publication-files.mjs';

const table=Array.from({length:256},(_,i)=>{for(let n=0;n<8;n++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
export function crc32(data){let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
// Store-only ZIP: deterministic names/content, fixed dates, no owner, local
// timestamps, absolute paths or host-specific extra metadata in either archive.
export function zipStore(root,target){
  const chunks=[],central=[];let offset=0;
  for(const file of walk(root)){
    if(file.split('/').some(p=>p==='..'||p==='')||path.isAbsolute(file))throw Error('Unsafe archive path');
    const name=Buffer.from(file),data=fs.readFileSync(path.join(root,file)),crc=crc32(data);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    chunks.push(header,name,data);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);central.push(entry,name);offset+=header.length+name.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22),count=central.length/2;
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);fs.writeFileSync(target,Buffer.concat([...chunks,directory,end]));
}
export function inspectZip(file){
  const data=fs.readFileSync(file),entries=[];let offset=0;
  while(data.readUInt32LE(offset)===0x04034b50){
    if(data.readUInt16LE(offset+8)!==0||data.readUInt16LE(offset+28)!==0)throw Error('Unexpected archive encoding or extra metadata');
    const size=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26),name=data.subarray(offset+30,offset+30+nameLength).toString('utf8'),content=data.subarray(offset+30+nameLength,offset+30+nameLength+size);
    if(crc32(content)!==data.readUInt32LE(offset+14))throw Error('Archive integrity failed');
    entries.push({name,data:content});offset+=30+nameLength+size;
  }
  if(data.readUInt32LE(offset)!==0x02014b50)throw Error('Missing archive directory');return entries;
}
