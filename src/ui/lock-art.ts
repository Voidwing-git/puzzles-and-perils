// Original inline artwork shared by the creator and live lock; no game assets.
let artwork=0;
export function lockArt(zone?:{angle:number;tolerance:number}){const prefix=`lock-${++artwork}-`;return `<svg class="lock-art" viewBox="0 0 640 520" aria-hidden="true">
  <defs><radialGradient id="lock-brass"><stop stop-color="#b69a62"/><stop offset=".72" stop-color="#665132"/><stop offset="1" stop-color="#302b24"/></radialGradient><radialGradient id="lock-steel"><stop stop-color="#4d5a60"/><stop offset="1" stop-color="#182328"/></radialGradient><linearGradient id="lock-pick-metal" x2="1" y2="0"><stop stop-color="#625b48"/><stop offset=".45" stop-color="#e1d4ac"/><stop offset="1" stop-color="#726246"/></linearGradient></defs>
  <path d="M156 63h328l38 40v314l-38 40H156l-38-40V103z" fill="#151e24" stroke="#414c51" stroke-width="3"/>
  <path d="M170 79h300l36 37v288l-36 37H170l-36-37V116z" fill="none" stroke="#85714b" opacity=".6"/>
  <circle cx="320" cy="260" r="174" fill="#0a1117" stroke="#b49a63" stroke-width="3"/>
  <circle cx="320" cy="260" r="163" fill="url(#lock-brass)" stroke="#4b3d2b" stroke-width="6"/>
  <circle cx="320" cy="260" r="147" fill="none" stroke="#c9af76" stroke-width="2" opacity=".55"/>
  <circle cx="320" cy="260" r="132" fill="none" stroke="#2a271f" stroke-width="15" stroke-dasharray="2 25"/>
  ${zone?zoneSlice(zone.angle,zone.tolerance):''}
  ${[0,1,2,3].map(i=>`<g transform="rotate(${i*90+45} 320 260)"><path d="m313 141 7-13 7 13-7 9z" fill="#c4af7a"/><path d="M311 157h18" stroke="#baa36f"/></g>`).join('')}
  ${[[161,107],[479,107],[161,413],[479,413]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="#7d6a48" stroke="#1d2020" stroke-width="3"/><path d="M${x-4} ${y+4}l8-8" stroke="#24231d" stroke-width="3"/>`).join('')}
  <circle class="lock-strain-ring" cx="320" cy="260" r="87" fill="#0e171b" stroke="#a38b58" stroke-width="4"/>
  <g class="lock-cylinder"><circle cx="320" cy="260" r="75" fill="url(#lock-steel)" stroke="#7a8277" stroke-width="3"/><circle cx="320" cy="260" r="61" fill="none" stroke="#526064"/>
    <path d="M310 239a14 14 0 1 1 20 0l5 40h-30z" fill="#050b10" stroke="#a8915f" stroke-width="2"/>
    <path d="M322 267v86q0 16 16 16h74" fill="none" stroke="#0c1419" stroke-width="17" stroke-linejoin="round"/><path d="M322 267v86q0 16 16 16h74" fill="none" stroke="#8b9698" stroke-width="9" stroke-linejoin="round"/><path d="M322 269v80" stroke="#d1d8cf" stroke-width="2"/>
  </g>
  <g class="lock-pick"><g class="lock-pick-handle"><path d="M320 174l-5-16V87q0-9 6-9t6 9v73l-4 14-1-3z" fill="url(#lock-pick-metal)" stroke="#24292b" stroke-width="1.5"/><path d="M319 86v67" stroke="#e3d5af" stroke-width="2"/></g><g class="lock-pick-tip"><path d="M320 263v-91l1-2 2 4v89z" fill="url(#lock-pick-metal)" stroke="#24292b" stroke-width="1.5"/><path d="m319 258 5-6" stroke="#ddd0a9" stroke-width="3"/></g></g>
  <path d="M187 71a235 235 0 0 1 266 0" fill="none" stroke="#607275" stroke-dasharray="1 14" stroke-width="3" opacity=".75"/>
</svg>`.replaceAll('id="lock-',`id="${prefix}`).replaceAll('url(#lock-',`url(#${prefix}`);}

// Used only by the private creator. The gameplay artwork receives no zone.
function zoneSlice(angle:number,tolerance:number){
  const point=(degrees:number,radius:number)=>{const r=degrees*Math.PI/180;return`${(320+Math.sin(r)*radius).toFixed(2)} ${(260-Math.cos(r)*radius).toFixed(2)}`;};
  const low=Math.max(-90,angle-tolerance),high=Math.min(90,angle+tolerance);
  return `<g class="lock-zone"><path d="M${point(low,164)} A164 164 0 0 1 ${point(high,164)} L${point(high,89)} A89 89 0 0 0 ${point(low,89)} Z"/><path class="lock-zone-center" d="M${point(angle,89)} L${point(angle,174)}"/></g>`;
}
