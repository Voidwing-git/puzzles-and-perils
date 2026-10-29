// Metadata changes wake receipt polling immediately. The version closes the
// race where an event arrives while an SDK read is still in flight.
export class ChangeSignal {
  version=0;
  #listeners=new Set<()=>void>();
  notify(){this.version++;for(const listener of [...this.#listeners])listener();}
  wait(version:number,timeoutMs:number){
    if(version!==this.version)return Promise.resolve();
    return new Promise<void>(resolve=>{
      const finish=()=>{clearTimeout(timer);this.#listeners.delete(finish);resolve();};
      const timer=setTimeout(finish,timeoutMs);this.#listeners.add(finish);
    });
  }
}
