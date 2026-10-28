import { expect, test } from '@playwright/test';

test('accepted rotation visibly animates channels while coordinates remain stationary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const piece = page.locator('[data-index="6"] .rotating-piece');
  await page.locator('[data-index="6"]').dblclick();
  await page.waitForFunction(() => document.querySelector('[data-index="6"] .rotating-piece')!.getAnimations().some((animation) => animation.playState === 'running'));
  const motion = await piece.evaluate((node) => {
    const animation = node.getAnimations()[0];
    const keyframes = (animation.effect as KeyframeEffect).getKeyframes();
    return { duration: animation.effect!.getTiming().duration,
      from: keyframes[0].transform, to: keyframes.at(-1)!.transform,
      coordinateTransform: getComputedStyle(node.parentElement!.querySelector('.tile-coordinate')!).transform };
  });
  expect(motion).toEqual({ duration: 160, from: 'rotate(-90deg)', to: 'rotate(0deg)', coordinateTransform: 'none' });
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy', 'false');
  await expect(piece).toHaveCSS('transform', 'none');
  // Keyboard repeats queue behind the current animation without lost turns.
  await page.locator('[data-index="6"]').focus();
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  await expect(page.locator('#revision')).toHaveText('Revision 4');
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-index="6"]')).toHaveAttribute('aria-label', /openings west and north/);
});

test('reduced motion bypasses tile rotation animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('[data-index="6"]').dblclick();
  await expect(page.locator('#revision')).toHaveText('Revision 1');
  await expect(page.locator('#rotate')).toHaveAttribute('aria-busy', 'false');
  expect(await page.locator('.rotating-piece').evaluateAll((nodes) => nodes.flatMap((node) => node.getAnimations()).length)).toBe(0);
});

test('two-power sample checks matching colors, flags mixing and can be completed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Prepared board').selectOption('dual-power');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Load prepared board' }).click();
  await page.getByLabel('Free play (turns off)').check();
  const rotate = async (index: number) => {
    await page.locator(`[data-index="${index}"]`).dblclick();
    await expect(page.locator('#rotate')).toHaveAttribute('aria-busy', 'false');
  };
  // Point both T-junctions at the vertical bridge: sources become mixed.
  await rotate(6);
  await rotate(16); await rotate(16);
  await expect(page.locator('#power-warning')).toBeVisible();
  await expect(page.locator('[data-index="11"]')).toHaveAttribute('aria-label', /mixed energy/);
  await expect(page.locator('#success')).toBeHidden();
  // Disconnect the bridge, then finish the lower channel.
  await rotate(6); await rotate(6);
  await rotate(16); await rotate(16);
  await rotate(17);
  await expect(page.locator('#power-warning')).toBeHidden();
  await expect(page.locator('#success-title')).toHaveText('The runes are awakened');
  await expect(page.locator('[data-index="9"]')).toHaveAttribute('aria-label', /target \(azure\).*azure powered/);
  await expect(page.locator('[data-index="19"]')).toHaveAttribute('aria-label', /target \(amber\).*amber powered/);
  await page.screenshot({ path: 'docs/evidence/m1-dual-power.png', fullPage: true });
});
