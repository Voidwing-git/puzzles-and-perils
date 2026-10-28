import type { PublicPuzzle } from '../core/state.ts';

// Animate accepted state, never speculative moves. The final SVG geometry is
// already rendered; rotate it back to its previous angle, then settle at zero.
export async function animateRotations(board: HTMLElement, before: PublicPuzzle, after: PublicPuzzle, clockwiseTile?: number): Promise<void> {
  if (before.puzzleId !== after.puzzleId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animations: Animation[] = [];
  after.tiles.forEach((tile, index) => {
    const previous = before.tiles[index];
    if (!tile || !previous || tile.terminal || tile.shape !== previous.shape || tile.rotation === previous.rotation) return;
    const group = board.children[index]?.querySelector<SVGGElement>('.rotating-piece');
    if (!group) return;
    const difference = (tile.rotation - previous.rotation + 4) % 4;
    // A requested 3 -> 0 rotation must still travel clockwise. Rollback uses
    // the shortest return path instead of spinning nearly a whole revolution.
    const degrees = index === clockwiseTile ? 90 : (difference === 3 ? -1 : difference === 2 ? -2 : difference) * 90;
    animations.push(group.animate(
      [{ transform: `rotate(${-degrees}deg)` }, { transform: 'rotate(0deg)' }],
      { duration: 160, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    ));
  });
  // Cancellation is harmless: a newly loaded snapshot remains authoritative.
  await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
}
