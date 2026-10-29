import type {LockState} from '../core/state.ts';
import {LOCK_OPEN_MS} from '../core/lockpick.ts';

// Presentation only: predicts travel from an acknowledged resistance limit,
// never damage or an unlocked state. The controller remains authoritative.
export function createLockMotion(root:HTMLElement){
  let frame=0,idle=0,held=false,started=0,lastFrame=0,visual=0,limit=3,limitKnown=false,opened=false;
  let puzzle='',revision=-1,ownAttempt=-1;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const turn=(value:number)=>{visual=value;root.style.setProperty('--lock-turn',value.toFixed(2)+'deg');};
  function tick(now:number){
    frame=0;if(!held)return;
    const dt=Math.min(40,Math.max(0,now-lastFrame));lastFrame=now;
    const target=Math.min(limit,89,(now-started)*90/LOCK_OPEN_MS);
    turn(Math.min(target,visual+dt*90/LOCK_OPEN_MS*1.8));
    root.classList.toggle('is-binding',limitKnown&&limit<90&&visual>=limit-.1);
    frame=requestAnimationFrame(tick);
  }
  function stop(){cancelAnimationFrame(frame);frame=0;clearTimeout(idle);}
  return{
    update(angle:number,lock:LockState|undefined,holding:boolean,feedback:LockState|undefined,id:string,rev:number){
      root.style.setProperty('--pick-angle',angle+'deg');
      if(id!==puzzle){stop();held=false;ownAttempt=-1;revision=-1;puzzle=id;turn(0);}
      opened=!!lock?.opened;
      if(holding&&!held){stop();started=performance.now();lastFrame=started;ownAttempt=(lock?.attempts??0)+1;turn(0);}
      const wasHeld=held;held=holding&&!opened;
      root.classList.toggle('lock-turning',held&&!reduced.matches);
      if(opened){stop();turn(90);root.classList.remove('is-binding');}
      else if(held){
        limit=feedback?.travelLimit??(feedback?.binding?feedback.turn:3);
        limitKnown=feedback?.travelLimit!==undefined||feedback?.binding===true;
        if(reduced.matches){cancelAnimationFrame(frame);frame=0;turn(feedback?.turn??0);root.classList.toggle('is-binding',!!feedback?.binding);}
        else if(!frame)frame=requestAnimationFrame(tick);
      }else if(wasHeld||!lock||lock.pickHealth===0){stop();turn(0);root.classList.remove('is-binding');}
      else if(rev!==revision){
        // Observers follow one continuous transform instead of starting a
        // fresh 0 -> turn -> 0 animation for every shared-state tick.
        stop();if(!lock.probeActor)ownAttempt=-1;
        const remote=lock.attempts!==ownAttempt;
        turn(remote?lock.turn:0);root.classList.toggle('is-binding',remote&&!!lock.binding);
        if(remote&&lock.turn>0)idle=window.setTimeout(()=>{turn(0);root.classList.remove('is-binding');},700);
      }
      revision=rev;
    },
    dispose(){stop();held=false;},
  };
}
