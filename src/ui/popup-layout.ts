export function popupLayout(viewportWidth: number, viewportHeight: number) {
  const availableWidth = Math.max(1, viewportWidth || 1600);
  const availableHeight = Math.max(1, viewportHeight || 1100);
  const margin = Math.min(32, Math.max(12, Math.floor(Math.min(availableWidth, availableHeight) * .04)));
  const height = Math.max(1, availableHeight - margin * 2);
  const width = Math.max(1, Math.floor(Math.min(availableWidth - margin * 2, 1200, height * 1.12)));
  return { width, height, marginThreshold: margin,
    anchorReference: 'POSITION' as const,
    anchorPosition: { left: availableWidth / 2, top: availableHeight / 2 },
    anchorOrigin: { horizontal: 'CENTER' as const, vertical: 'CENTER' as const },
    transformOrigin: { horizontal: 'CENTER' as const, vertical: 'CENTER' as const },
    disableClickAway: false };
}
