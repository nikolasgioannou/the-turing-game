import { test, expect, type Browser } from '@playwright/test';
async function participants(browser: Browser) {
  const humanContext = await browser.newContext(),
    judgeContext = await browser.newContext();
  const h = await humanContext.newPage(),
    j = await judgeContext.newPage();
  await h.goto('/');
  await j.goto('/');
  await h.getByRole('button', { name: /Play as human/ }).click();
  await j.getByRole('button', { name: /Play as judge/ }).click();
  await expect(j.getByLabel('Ask the opening question')).toBeVisible();
  return { h, j, humanContext, judgeContext };
}
test('full multiplayer match, spectator vote and public replay', async ({ browser }) => {
  test.setTimeout(90_000);
  const { h, j, humanContext, judgeContext } = await participants(browser);
  const spectatorContext = await browser.newContext();
  const s = await spectatorContext.newPage();
  await s.goto(j.url());
  await expect(s.getByRole('heading', { name: 'Who do you think is human?' })).toBeVisible();
  await s.getByRole('button', { name: 'A', exact: true }).click();
  const humanLabel = (await h.getByText(/YOU ARE CONTESTANT/).textContent())!.trim().slice(-1);
  await j.getByLabel('Ask the opening question').fill('What is your favorite food?');
  await j.getByRole('button', { name: /Ask both contestants/ }).click();
  await h.getByLabel('Write your opening reply').fill('pizza, obviously.');
  await expect(j.getByText('pizza, obviously.', { exact: true })).toHaveCount(0);
  await h.getByRole('button', { name: /Submit opening reply/ }).click();
  await expect(j.getByText('pizza, obviously.', { exact: true })).toBeVisible();
  await j.getByLabel('Message the group').fill('What topping?');
  await j.getByRole('button', { name: 'Send', exact: false }).click();
  await h.getByLabel('Message the group').fill('mushrooms');
  await h.getByLabel('Message the group').press('Enter');
  await expect(s.getByText('mushrooms', { exact: true })).toBeVisible();
  await expect(h.getByLabel('Message the group')).toHaveValue('');
  await s.screenshot({ path: 'work/chat-desktop.png', fullPage: true });
  await h.setViewportSize({ width: 390, height: 844 });
  await h.screenshot({ path: 'work/chat-mobile.png', fullPage: true });
  expect(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(j.getByRole('heading', { name: 'Who is human?' })).toBeVisible({ timeout: 65_000 });
  await expect(h.getByLabel('Message the group')).toHaveCount(0);
  await j.getByRole('button', { name: `Contestant ${humanLabel}`, exact: true }).click();
  await j.getByLabel('What gave them away?').fill('They kept it simple.');
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await expect(
    s.getByRole('heading', { name: `Contestant ${humanLabel} was human.` }),
  ).toBeVisible();
  await expect(s.getByText('They kept it simple.', { exact: false })).toBeVisible();
  await expect(s.getByText('Audience guesses')).toBeVisible();
  await s.screenshot({ path: 'work/match-desktop.png', fullPage: true });
  const url = s.url();
  await spectatorContext.close();
  const replay = await browser.newPage();
  await replay.goto(url);
  await expect(
    replay.getByRole('heading', { name: `Contestant ${humanLabel} was human.` }),
  ).toBeVisible();
  await replay.close();
  await humanContext.close();
  await judgeContext.close();
});
test('invite room, public visibility, and disconnect ends the match', async ({ browser }) => {
  const hc = await browser.newContext(),
    jc = await browser.newContext();
  const h = await hc.newPage(),
    j = await jc.newPage();
  await h.goto('/');
  await h.getByRole('button', { name: /Create an invite room/ }).click();
  await h.getByRole('button', { name: 'I’ll be the human' }).click();
  const invite = await h.getByLabel('Invitation link').inputValue();
  await j.goto(invite);
  await expect(j.getByLabel('Ask the opening question')).toBeVisible();
  await hc.close();
  await expect(j.getByRole('status').filter({ hasText: 'A player disconnected' })).toBeVisible();
  await jc.close();
});
test('mobile lobby has usable controls and no horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Play as human/ })).toBeEnabled();
  await page.screenshot({ path: 'work/lobby-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});
test('desktop lobby screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Play as judge/ })).toBeEnabled();
  await page.screenshot({ path: 'work/lobby-desktop.png', fullPage: true });
});
test('forged cross-origin sockets are rejected', async ({ request }) => {
  const response = await request.get('/ws', { headers: { Origin: 'https://evil.example' } });
  expect(response.status()).toBe(403);
});
