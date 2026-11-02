import type {ChallengeState} from '../core/challenges.ts';
export const hexCoordinates=(count:number)=>{
  const cells=[[0,0],[0,-1],[1,0],[-1,1],[1,-1],[0,1],[-1,0]];
  if(count>7)for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))===2)cells.push([q,r]);
  return cells;
};
export function constrainedHexArt(c:ChallengeState){
  const radius=c.pieces.length>7?39:66,d=radius*Math.sqrt(3),center=([q,r]:number[])=>[300+q*.866*d,210+(r+q*.5)*d];
  const polygon=(x:number,y:number,r:number)=>Array.from({length:6},(_,j)=>[x+r*Math.sin((j*60+30)*Math.PI/180),y-r*Math.cos((j*60+30)*Math.PI/180)].join(',')).join(' ');
  const outline=polygon(300,210,213),blank=hexCoordinates(c.pieces.length).filter(([q,r])=>!c.pieces.some(p=>p[0]===q&&p[1]===r));
  return `<svg viewBox="0 0 600 420" class="challenge-art" aria-hidden="true"><defs><clipPath id="circuit-boundary"><polygon points="${outline}"/></clipPath><radialGradient id="circuit-glass"><stop stop-color="#91b8c5" stop-opacity=".6"/><stop offset="1" stop-color="#234750" stop-opacity=".3"/></radialGradient></defs><polygon class="hex-board-boundary" points="${outline}"/><g clip-path="url(#circuit-boundary)">${blank.map(p=>{const [x,y]=center(p);return `<polygon class="hex-dormant" points="${polygon(x,y,radius-2)}"/>`;}).join('')}${c.pieces.map(([q,r,mask],i)=>{const [x,y]=center([q,r]);return `<g class="hex-tile" role="button" tabindex="0" aria-label="Rotate hex ${i+1}" data-choice="${i}"><polygon class="hex-outer" points="${polygon(x,y,radius)}"/><polygon class="hex-glass" points="${polygon(x,y,radius-4)}" style="fill:url(#circuit-glass)"/><g class="hex-channels" data-rotation="${c.values[i]}" style="transform-origin:${x}px ${y}px;transform:rotate(${c.values[i]*60}deg)">${Array.from({length:6},(_,dir)=>mask&(1<<dir)?`<path d="M${x} ${y}l${radius*.866*Math.sin(dir*Math.PI/3)} ${-radius*.866*Math.cos(dir*Math.PI/3)}"/>`:'').join('')}</g><circle cx="${x}" cy="${y}" r="3"/></g>`;}).join('')}</g></svg>`;
}
