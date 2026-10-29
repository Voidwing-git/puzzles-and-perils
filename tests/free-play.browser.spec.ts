import {test,expect} from '@playwright/test';

test('new puzzles default to free play even with an older turns draft; editing keeps the saved mode',async({page})=>{
  await page.goto('/');await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();
  await expect(page.locator('#draft-free')).toBeChecked();
  await page.locator('#draft-free').uncheck();await page.locator('#publish-draft').click();
  await expect(page.locator('#free-play')).not.toBeChecked();
  await page.locator('#open-setup').click();await page.locator('#choose-pipes').click();await expect(page.locator('#draft-free')).toBeChecked();
  await page.locator('#return-gm').click();await expect(page.locator('#free-play')).not.toBeChecked();
  await page.locator('#edit-puzzle').click();await expect(page.locator('#draft-free')).not.toBeChecked();
});
