import {LEGACY_RING_SYMBOLS,RING_STEPS,type RingSymbols} from '../core/ring-door.ts';

// Original geometric animal carvings. No game artwork or font assets.
export function ringSymbolArt(index:number):string {
  if(index===0)return `<path d="M-16-12l-4-8 9 1 5-5H6l5 5 9-1-4 8 4 7-4 17-9 8H-7l-9-8-4-17z"/><path class="ring-glyph-cut" d="m-10-4 5 2m10 0 5-2M-7 7l7-4 7 4-3 7h-8zM0 14v5"/>`;
  if(index===1)return `<path d="M-3-9-22-22l-2 20 9 9-5 16 17-9L0 24l3-10 17 9-5-16 9-9-2-20L3-9 0-17z"/><path class="ring-glyph-cut" d="M0-12v30M-7-6l-9-6 3 11 8 4M7-6l9-6-3 11-8 4M-6 10l-6 5M6 10l6 5"/>`;
  if(index===2)return `<path d="M-19-22-10-15H10l9-7-3 18 4 7-5 16L0 25-15 19-20 3l4-7z"/><path class="ring-glyph-cut" d="M-13-8a7 7 0 1 0 0 14 7 7 0 0 0 0-14M13-8a7 7 0 1 0 0 14 7 7 0 0 0 0-14M-3 4l3 7 3-7M-10 14l6 4m14-4-6 4"/>`;
  if(index===3)return `<path d="M-22-23-8-14 0-18 8-14 22-23 17-2 21 7 12 5 9 17 0 25-9 17-12 5-21 7-17-2z"/><path class="ring-glyph-cut" d="m-13-5 7 3m19-3-7 3M-9 6l9 4 9-4M-4 13h8l-4 7zM-14-15l3 7m25-7-3 7"/>`;
  if(index===4)return `<path d="M-13 20c-19-4-15-19 2-21 18-3 27-10 17-18" fill="none" stroke="#d1bb82" stroke-width="8" stroke-linecap="round"/><path d="m-1-23 14-1 10 10-12 5-11-6z"/><path class="ring-glyph-cut" d="m7-19 3 2m6 0 4 2M-15 16l8 2M-13 5l7 1M4-5l7 1"/><path d="m-13 20 13 6-6-9z"/>`;
  if(index===5)return `<path d="M-10-7-14 1-8 18 0 25 8 18 14 1 10-7z"/><path d="M-6-7-15-17-14-25m-1 8-9-4m9 4-8 7M6-7l9-10-1-8m1 8 9-4m-9 4 8 7" fill="none" stroke="#d1bb82" stroke-width="4" stroke-linecap="round"/><path class="ring-glyph-cut" d="m-8 1 4 3m12-3-4 3M-5 13l5 3 5-3M0 16v6"/>`;
  if(index===6)return `<path d="M-23-25-6-13H6l17-12-4 28L0 25-19 3z"/><path class="ring-glyph-cut" d="m-17-15 6 8m28-8-6 8M-18 1l12 5 6 16L6 6l12-5M-12-1l5 1m19-1-5 1M-3 15h6"/>`;
  if(index===7)return `<path d="M-17 20-11 9-17-2-10-18 3-25 14-21 22-12 9-10 7 2 20 15 4 9-1 23-7 17z"/><path class="ring-glyph-cut" d="m1-18 5-1M-8-8l8 4 2 12M-12 0l7 4m-5 2 7 4M-2 16l-1 5"/>`;
  return `<path d="M-21 22-15 7-23-5-13-2-17-19-4-9 2-22 7-15 17-21 14-10 24-3 15 4 6 2 10 15 1 23-4 15-12 22-8 8z"/><path class="ring-glyph-cut" d="m9-9 5 2M5 0l-7-4-9 3 7 9M-14-13l4 9M0 12l3 4M15-2l6-1"/>`;
}

let artwork=0;
export function ringDoorArt(interactive=false,symbols:RingSymbols=LEGACY_RING_SYMBOLS):string {
  const id=`ring-art-${++artwork}-`,radii=[203,145,87];
  return `<svg class="ring-door-art" viewBox="0 0 720 660" aria-hidden="true">
  <defs>
    <linearGradient id="${id}stone" x2=".6" y2="1"><stop stop-color="#536168"/><stop offset=".45" stop-color="#29373d"/><stop offset="1" stop-color="#101d25"/></linearGradient>
    <radialGradient id="${id}bronze"><stop stop-color="#c1a56d"/><stop offset=".5" stop-color="#6f6045"/><stop offset=".83" stop-color="#a28b5a"/><stop offset="1" stop-color="#3d382b"/></radialGradient>
    <radialGradient id="${id}depth"><stop stop-color="#172d31"/><stop offset=".55" stop-color="#09171b"/><stop offset="1" stop-color="#02080d"/></radialGradient>
    <clipPath id="${id}opening"><circle cx="360" cy="320" r="249"/></clipPath>
  </defs>
  <path d="M102 25h516l38 38v522l-38 38H102l-38-38V63z" fill="url(#${id}stone)" stroke="#647273" stroke-width="4"/>
  <path d="M119 43h482l36 36v490l-36 36H119l-36-36V79z" fill="none" stroke="#8a7957" stroke-width="2" opacity=".65"/>
  <path d="m111 48 8 28-21 19 13 25m501-61-9 25 18 15-7 26M94 521l24 13-9 38 20 30m492-95-25 22 14 23-17 46" fill="none" stroke="#122128" stroke-width="4"/>
  <circle cx="360" cy="320" r="266" fill="#0a141b" stroke="#9b865c" stroke-width="5"/>
  <circle cx="360" cy="320" r="255" fill="url(#${id}depth)" stroke="#26393d" stroke-width="8"/>
  <g class="ring-portal" clip-path="url(#${id}opening)">
    <path d="M190 590V190l72-58h196l72 58v400M228 590V211l52-43h160l52 43v379M265 590V234l31-28h128l31 28v356" fill="none" stroke="#294044" stroke-width="9"/>
    <path d="M307 590V254h106v336z" fill="#020b10"/><path d="m312 590 24-336m48 0 24 336" stroke="#719583" stroke-width="2" opacity=".4"/>
    <path class="ring-door-light" d="m360 250-134 370h268z" fill="#abf4d9" opacity=".07"/>
  </g>
  <g clip-path="url(#${id}opening)"><g class="ring-door-leaf">
    <circle cx="360" cy="320" r="249" fill="url(#${id}stone)" stroke="#b39a66" stroke-width="5"/>
    ${radii.map((radius,ring)=>`<g class="door-ring" data-ring="${ring}">
      <circle cx="360" cy="320" r="${radius}" fill="none" stroke="#101c23" stroke-width="58"/>
      <circle cx="360" cy="320" r="${radius}" fill="none" stroke="url(#${id}bronze)" stroke-width="51"/>
      <circle cx="360" cy="320" r="${radius+23}" fill="none" stroke="#d1b982" stroke-width="1.5" opacity=".65"/>
      <circle cx="360" cy="320" r="${radius-23}" fill="none" stroke="#302d25" stroke-width="3"/>
      ${Array.from({length:18},(_,i)=>`<path d="M360 ${320-radius-22}v5" transform="rotate(${i*20} 360 320)" stroke="#332e25" stroke-width="2"/>`).join('')}
      ${symbols.map((symbol,slot)=>`<g transform="translate(360 320) rotate(${-slot*360/RING_STEPS}) translate(0 ${-radius})"><circle r="24" fill="#253035" stroke="#b7a171" stroke-width="1.5"/><g class="ring-animal" data-symbol="${symbol}" transform="scale(.72)">${ringSymbolArt(symbol)}</g></g>`).join('')}
    </g>`).join('')}
    <circle cx="360" cy="320" r="53" fill="#111e25" stroke="#9a8259" stroke-width="5"/>
    <g class="ring-door-seal"><path d="m360 278 36 21v42l-36 21-36-21v-42z" fill="#3c4a4b" stroke="#baa271" stroke-width="2"/><path d="m360 287 27 33-27 33-27-33z" fill="#1c2f34" stroke="#bfa875" stroke-width="2"/><path class="ring-seal-rune" d="m360 299 13 21-13 21-13-21z" fill="#708f91"/>
    <path d="M334 305h-6m58 0h6M334 335h-6m58 0h6" stroke="#c6af79" stroke-width="3"/></g>
    <path d="M331 96v23m58-23v23M331 155v23m58-23v23M331 213v23m58-23v23" stroke="#e8d59c" stroke-width="2" opacity=".8"/>
  </g></g>
  ${interactive?radii.map((radius,ring)=>`<circle class="ring-hit" data-ring-hit="${ring}" cx="360" cy="320" r="${radius}" fill="none" stroke="transparent" stroke-width="54"/>`).join(''):''}
  <path class="ring-alignment-arrow" d="m350 55 10 17 10-17z" fill="#e5d29a" stroke="#132027" stroke-width="2"/>
  <path d="M139 583h442l26 26H113z" fill="#223239" stroke="#6c7975" stroke-width="3"/>
  <path d="M156 592h408" stroke="#b4a072" stroke-width="2"/>
  <g class="ring-door-dust" fill="#d2c29b"><circle cx="172" cy="567" r="2"/><circle cx="235" cy="577" r="3"/><circle cx="482" cy="569" r="2"/><circle cx="546" cy="576" r="3"/></g>
  </svg>`;
}
