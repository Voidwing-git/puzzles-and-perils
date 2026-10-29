// Fit the playable square between its order sidebar and vertical piece tray.
// Authoring keeps its own sidebar/preview layout and can scroll independently.
export function installPuzzleFit(matchTray: () => void) {
  let scheduled = false;
  let fittedKey = '';
  let settling = 0;
  const fit = () => {
    scheduled = false;
    const play = document.getElementById('play-screen')!;
    if (play.hidden) return;
    if(document.body.classList.contains('challenge-game')||document.body.classList.contains('lock-game')||document.body.classList.contains('ring-game'))return;
    const panel = play.querySelector<HTMLElement>('.board-panel')!;
    const cube=document.getElementById('cube-board');
    const frame = cube&&!cube.hidden?cube:panel.querySelector<HTMLElement>('.board-frame')!;
    const board = document.getElementById('board')!;
    const table = document.getElementById('game-table')!;
    const stage = table.querySelector<HTMLElement>('.board-stage')!;
    const key=[innerWidth,innerHeight,board.dataset.puzzle,board.dataset.columns].join(':');
    if(key!==fittedKey){fittedKey=key;settling=0;}
    if(settling>=4){matchTray();return;}
    settling++;
    const top = frame.getBoundingClientRect().top + scrollY;
    // Reserve footer/success space; the tray now scrolls within its own column.
    const width = Math.floor(Math.max(100, Math.min(stage.clientWidth, 960, innerHeight - top - 64)));
    table.style.setProperty('--board-size', `${width}px`);
    if (Math.abs(panel.getBoundingClientRect().width - width) > 1) {
      panel.style.setProperty('--board-fit-width', `${width}px`);
      matchTray();
    }
    if(settling<4) requestAnimationFrame(fit);
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(fit); } };
  const observer = new ResizeObserver(schedule);
  for (const selector of ['#gm-toolbar', '.controls', '#turn-order-panel', '.board-stage', '#board']) {
    const element = document.querySelector(selector); if (element) observer.observe(element);
  }
  window.addEventListener('resize', schedule);
  return schedule;
}
