let dismiss: (() => void) | undefined;
export function closePieceMenu() { dismiss?.(); }
export function updatePieceMenu(disabled: boolean, editing = false) {
  document.querySelectorAll<HTMLButtonElement>('.piece-context-menu button').forEach(button => { button.disabled = disabled || button.dataset.unavailable === 'true' || (editing && button.dataset.return !== 'true'); });
}

export function openPieceMenu(anchor: HTMLElement, x: number, y: number, name: string,
  disabled: boolean, choose: (destination: 'socket' | 'tray' | 'hide' | 'return') => void, revealed: boolean | 'placed' = false, canRestore = true) {
  closePieceMenu();
  const menu = document.createElement('div');
  menu.className = 'piece-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', name);
  const title = document.createElement('strong'); title.textContent = name; menu.append(title);
  for (const [label, destination] of (revealed === 'placed' ? [['Remove to tray', 'return']] as const : revealed ? [['Hide piece', 'hide']] as const : [['Restore piece', 'socket'], ['Give piece to players', 'tray']] as const)) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.dataset.return = String(destination === 'return');
    button.dataset.unavailable = String(destination === 'socket' && !canRestore);
    button.disabled = disabled || button.dataset.unavailable === 'true';
    if (destination === 'socket' && !canRestore) button.title = 'Original socket unavailable for this older piece. Give it to players instead.';
    button.setAttribute('role', 'menuitem');
    button.onclick = () => { closePieceMenu(); choose(destination); };
    menu.append(button);
  }
  document.body.append(menu);
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) closePieceMenu(); };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); closePieceMenu(); anchor.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', key);
  dismiss = () => { menu.remove(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); dismiss = undefined; };
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
