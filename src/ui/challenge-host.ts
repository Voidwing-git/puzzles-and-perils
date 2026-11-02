import {mountChallengeView} from './challenge-view.ts';
import {mountAdvancedView} from './challenge-advanced-view.ts';
import type {ChallengeAction} from '../core/challenges.ts';
import type {PublicPuzzle} from '../core/state.ts';
export function mountChallengeHost(root:HTMLElement,request:(a:ChallengeAction)=>Promise<boolean>){
  let mode=0,view:ReturnType<typeof mountChallengeView>|undefined;
  return{update(p:PublicPuzzle,play:boolean,gm:boolean,busy:boolean,autoEnter=true){const next=p.challenge?.version===2?2:1;if(next!==mode){view?.dispose();view=next===2?mountAdvancedView(root,request):mountChallengeView(root,request);mode=next;}root.dataset.version=String(next);(view!.update as ReturnType<typeof mountAdvancedView>['update'])(p,play,gm,busy,autoEnter);},report(message:string){view?.report(message);},dispose(){view?.dispose();}};
}
