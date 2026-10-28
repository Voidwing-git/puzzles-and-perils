export const TRUSTED_HOSTS=['https://www.owlbear.rodeo','https://owlbear.rodeo'] as const;

export function trustedHost(ref:string|null):string|null{
  try{
    if(!ref||ref.length>2048)return null;
    const parts=atob(ref.replace(/-/g,'+').replace(/_/g,'/')).split(' ');
    return parts.length===2&&parts[1].length>0&&parts[1].length<=256&&TRUSTED_HOSTS.some(host=>host===parts[0])?parts[0]:null;
  }catch{return null;}
}

// Run before the SDK is initialized. Its reference parameter is supplied by
// the embedding page, so it must not be allowed to select an arbitrary host.
if(typeof window!=='undefined'){
  const ref=new URLSearchParams(location.search).get('obrref');
  if(window.parent!==window||ref){
    const origin=trustedHost(ref);
    if(window.parent===window||!origin){
      document.body.textContent='Open this puzzle from Owlbear Rodeo. Untrusted embedding was blocked.';
      throw new Error('Untrusted extension host blocked.');
    }
    window.addEventListener('message',event=>{
      if(event.origin!==origin||event.source!==window.parent)event.stopImmediatePropagation();
    },true);
  }
}
