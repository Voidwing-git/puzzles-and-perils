import * as THREE from 'three';
import {tileArtwork,socketFractures} from './tile.ts';
import type {CubeViewCell} from './cube-view.ts';

// Bake the existing SVG artwork with its real stylesheet into a face texture.
// No second set of rune shapes or channel colors to drift from the flat board.
export function stoneMaterial(cell:CubeViewCell,chosen:boolean,redraw:()=>void,turns=0,onReady?:()=>void){
  const holder=document.createElement('div');
  holder.className=['tile',cell.tile?'occupied':'empty',cell.powered?'powered':'',cell.energy??'',cell.mixed?'mixed':''].join(' ');
  holder.style.cssText='position:fixed;left:-10000px;top:0;width:512px;height:512px;pointer-events:none';
  const position=`${cell.face} ${String.fromCharCode(65+cell.x)}${cell.y+1}`;
  holder.innerHTML=tileArtwork(cell.tile,position,cell.powered)+(cell.fractured?socketFractures():'');
  document.body.append(holder);
  const svg=holder.querySelector('svg')!;
  const fractures=holder.querySelector('.socket-fractures');
  if(fractures)svg.append(...Array.from(fractures.children));
  for(const shape of svg.querySelectorAll<SVGElement>('path,circle,rect,text')){
    const style=getComputedStyle(shape);
    for(const property of ['fill','stroke','stroke-width','stroke-dasharray','opacity','font-family','font-size','filter'])shape.style.setProperty(property,style.getPropertyValue(property));
  }
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','512');svg.setAttribute('height','512');
  const channels=svg.querySelector('.rotating-piece');
  const rotating=svg.cloneNode(false) as SVGElement;
  if(channels){rotating.append(channels.cloneNode(true));channels.remove();}
  const serializer=new XMLSerializer();
  const markup=serializer.serializeToString(svg),channelMarkup=serializer.serializeToString(rotating);holder.remove();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  const paintStone=()=>{
    const gradient=ctx.createLinearGradient(0,0,512,512);gradient.addColorStop(0,cell.tile?'#34414b':'#131c26');gradient.addColorStop(.55,cell.tile?'#232d37':'#131c26');gradient.addColorStop(1,cell.tile?'#1b252e':'#131c26');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
    // Subtle deterministic stone grain; the existing artwork stays legible.
    for(let i=0;i<1100;i++){const x=(i*173)%512,y=(i*317)%512;ctx.fillStyle=i%2?'#ffffff06':'#0000000a';ctx.fillRect(x,y,1+(i%3),1);}
    ctx.strokeStyle=chosen?'#d2b583':'#53606a';ctx.lineWidth=chosen?9:3;ctx.strokeRect(2,2,508,508);
  };
  paintStone();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.95,metalness:.08,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:cell.powered?.32:.1});
  let disposed=false;material.addEventListener('dispose',()=>{disposed=true;});
  const load=(markup:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);});
  void Promise.all([load(markup),load(channelMarkup)]).then(([base,channel])=>{
    if(disposed)return;
    const duration=turns&&!matchMedia('(prefers-reduced-motion: reduce)').matches?240:0;
    const start=performance.now();
    let first=true;
    const frame=(now:number)=>{
      if(disposed)return;
      const progress=duration?Math.min(1,(now-start)/duration):1;
      const eased=1-Math.pow(1-progress,3);
      paintStone();
      ctx.save();ctx.translate(256,256);ctx.rotate(-(1-eased)*turns*Math.PI/2);ctx.drawImage(channel,-256,-256,512,512);ctx.restore();
      ctx.drawImage(base,0,0,512,512);
      texture.needsUpdate=true;if(first){first=false;onReady?.();}redraw();
      if(progress<1)requestAnimationFrame(frame);
    };
    frame(start);
  }).catch(()=>{ /* Retain the stone placeholder if browser image decode fails. */ });
  return material;
}
