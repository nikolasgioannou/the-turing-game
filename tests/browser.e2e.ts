import { test, expect, type Browser } from '@playwright/test';

async function participants(browser: Browser) {
  const humanContext = await browser.newContext(),
    judgeContext = await browser.newContext();
  const h = await humanContext.newPage(),
    j = await judgeContext.newPage();

  await h.goto('/');
  await j.goto('/');
  await h.getByRole('button', { name: 'Start game', exact: true }).click();
  await h.getByRole('button', { name: /Play as human/ }).click();
  await j.getByRole('button', { name: 'Start game', exact: true }).click();
  await j.getByRole('button', { name: /Play as judge/ }).click();
  await h.getByLabel('First name', { exact: true }).waitFor();
  await h.screenshot({ path: 'work/name-entry-desktop.png' });
  await h.getByLabel('First name', { exact: true }).fill('Nik');
  await h.getByRole('button', { name: 'Enter', exact: true }).click();
  await j.getByLabel('First name', { exact: true }).fill('Marc');
  await j.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(j.getByLabel('Message the group')).toBeVisible();
  await expect(h.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  return { h, j, humanContext, judgeContext };
}

test('full multiplayer match, spectator vote and public replay', async ({ browser }) => {
  test.setTimeout(120_000);

  const { h, j, humanContext, judgeContext } = await participants(browser);
  const spectatorContext = await browser.newContext();
  const s = await spectatorContext.newPage();

  await s.goto(j.url());
  await expect(s.getByRole('heading', { name: 'Who do you think is the AI?' })).toBeVisible();
  await s.getByRole('button', { name: 'A', exact: true }).click();

  const humanLabel = (await h.getByText(/YOU ARE CONTESTANT/).textContent())!.trim().slice(-1);

  await j.getByLabel('Message the group').fill('What is your favorite food?');
  await j.getByRole('button', { name: /Send/ }).click();
  await h.getByLabel('Message the group').fill('pizza, obviously.');
  await expect(j.getByText('pizza, obviously.', { exact: true })).toHaveCount(0);
  await h.getByRole('button', { name: /Send/ }).click();
  await expect(j.getByText('pizza, obviously.', { exact: true }).first()).toBeVisible();
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

  await expect(j.getByRole('button', { name: 'Submit verdict & reveal' })).toBeVisible({
    timeout: 95_000,
  });

  await expect(h.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  await j
    .getByRole('button', { name: `Contestant ${humanLabel === 'A' ? 'B' : 'A'}`, exact: true })
    .click();

  await j.getByLabel('What gave them away?').fill('They kept it simple.');
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();

  await expect(s.getByRole('heading', { name: `Contestant ${humanLabel} wins!` })).toBeVisible();

  await expect(s.getByText('They kept it simple.', { exact: false })).toBeVisible();
  await expect(s.getByText('Audience guesses')).toHaveCount(0);
  await s.screenshot({ path: 'work/match-desktop.png', fullPage: true });

  const url = s.url();

  await spectatorContext.close();

  const replay = await browser.newPage();

  await replay.goto(url);

  await expect(
    replay.getByRole('heading', { name: `Contestant ${humanLabel} wins!` }),
  ).toBeVisible();

  await replay.close();
  await humanContext.close();
  await judgeContext.close();
});

test('invite and chat survive refreshes and dropped sockets', async ({ browser }) => {
  const hc = await browser.newContext(),
    jc = await browser.newContext();

  await hc.addInitScript(() => {
    const Native = window.WebSocket;

    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).gameSocket = this;
      }
    };
  });

  const h = await hc.newPage(),
    j = await jc.newPage();

  await h.goto('/');
  await h.getByRole('button', { name: 'Start game', exact: true }).click();
  await h.getByRole('button', { name: 'Invite a friend' }).click();
  await h.getByRole('button', { name: /Play as human/ }).click();

  const invite = await h.getByLabel('Invitation link').inputValue();

  await j.goto(invite);
  await h.getByLabel('First name', { exact: true }).fill('Nik');
  await h.getByRole('button', { name: 'Enter', exact: true }).click();
  await j.getByLabel('First name', { exact: true }).fill('Marc');
  await j.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(j.getByLabel('Message the group')).toBeVisible();
  await expect(h.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  const matchUrl = j.url();
  const label = await h.getByText(/YOU ARE CONTESTANT/).textContent();

  await h.reload();
  await j.reload();
  await expect(j.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByText(/YOU ARE CONTESTANT/)).toHaveText(label!);
  await j.getByLabel('Message the group').fill('hi');
  await j.getByRole('button', { name: /Send/ }).click();
  await h.getByLabel('Message the group').fill('hey');
  await h.getByRole('button', { name: /Send/ }).click();

  await expect(
    h.getByText('Chat with the group. Avoid being mistaken for AI.', { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  await h.evaluate(() => (window as any).gameSocket.close());
  await expect(h.getByRole('alert')).toContainText('Reconnecting');
  await expect(h.getByRole('alert')).toHaveCount(0);
  await expect(h.getByLabel('Message the group')).toBeEnabled();
  await h.getByLabel('Message the group').fill('back after reconnect');
  await h.getByLabel('Message the group').press('Enter');
  await expect(j.getByText('back after reconnect', { exact: true })).toBeVisible();
  await h.close();

  const restored = await hc.newPage();

  await restored.goto(matchUrl);
  await expect(restored.getByText(/YOU ARE CONTESTANT/)).toHaveText(label!);
  await expect(restored.getByText('back after reconnect', { exact: true })).toBeVisible();
  await expect(j.getByText(/A player disconnected/)).toHaveCount(0);
  await j.getByRole('button', { name: 'Make a guess' }).click();
  await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await expect(j.getByRole('heading', { name: 'Contestant B wins!' })).toBeVisible();

  await hc.close();
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
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'work/lobby-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test('desktop lobby screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');

  const start = page.getByRole('button', { name: 'Start game', exact: true });

  if (process.env.OPENROUTER_API_KEY) await expect(start).toBeEnabled();
  else {
    await expect(start).toBeDisabled();

    await expect(
      page.getByText('Set OPENROUTER_API_KEY in .env and restart the server.'),
    ).toBeVisible();
  }

  await page.screenshot({ path: 'work/lobby-desktop.png', fullPage: true });
});

test('forged cross-origin sockets are rejected', async ({ request }) => {
  const response = await request.get('/ws', { headers: { Origin: 'https://evil.example' } });

  expect(response.status()).toBe(403);
});

test('arcade lobby opens a role dialog without live viewing', async ({ page }) => {
  await page.goto('/');

  const start = page.getByRole('button', { name: 'Start game', exact: true });

  await expect(start).toBeEnabled();
  await expect(page.getByRole('button', { name: /Play as human/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Watch live/ })).toHaveCount(0);
  await start.click();
  await expect(page.getByRole('dialog', { name: 'Start a game' })).toBeVisible();

  const bounds = await page.getByRole('dialog').boundingBox();
  const viewport = page.viewportSize()!;

  expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: 'work/start-dialog.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(start).toBeFocused();
});

test('arcade chat keeps messages and composer readable on mobile', async ({ browser }) => {
  const { h, j, humanContext, judgeContext } = await participants(browser);

  await j.getByLabel('Message the group').fill('whats your name');
  await j.getByRole('button', { name: /Send/ }).click();
  await h.getByLabel('Message the group').fill('im sam');
  await h.getByRole('button', { name: /Send/ }).click();
  await expect(j.getByText('im sam', { exact: true })).toBeVisible();
  await j.screenshot({ path: 'work/arcade-chat-desktop.png', fullPage: true });
  await h.setViewportSize({ width: 390, height: 844 });

  await h.evaluate(() => {
    const original = WebSocket.prototype.send;

    (window as any).draftFrames = [];

    WebSocket.prototype.send = function (data) {
      if (typeof data === 'string') {
        const command = JSON.parse(data);

        if (command.type === 'draft') (window as any).draftFrames.push(command.text);
      }

      return original.call(this, data);
    };
  });

  await expect(h.getByText(/Draft shared privately with AI/)).toBeVisible();
  await expect(j.getByText(/Draft shared privately with AI/)).toHaveCount(0);
  await h.getByLabel('Message the group').fill('private unfinished thought');

  await expect
    .poll(() => h.evaluate(() => (window as any).draftFrames.at(-1)))
    .toBe('private unfinished thought');

  await expect(j.getByRole('log')).not.toContainText('private unfinished thought');
  await h.getByLabel('Message the group').fill('');
  await expect.poll(() => h.evaluate(() => (window as any).draftFrames.at(-1))).toBe('');
  await expect(h.getByLabel('Message the group')).toBeInViewport();
  expect(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await h.screenshot({ path: 'work/arcade-chat-mobile.png', fullPage: true });

  await j.getByRole('button', { name: 'Make a guess' }).click();
  await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await expect(j.getByRole('heading', { name: 'Contestant B wins!' })).toBeVisible();

  await humanContext.close();
  await judgeContext.close();
});

test('judge can return to chat or submit an early guess', async ({ browser }) => {
  const { h, j, humanContext, judgeContext } = await participants(browser);

  await expect(j.getByRole('button', { name: 'Make a guess' })).toHaveCount(0);
  await j.getByLabel('Message the group').fill('favorite food?');
  await j.getByRole('button', { name: 'Send' }).click();
  await h.getByLabel('Message the group').fill('pasta');
  await h.getByRole('button', { name: 'Send' }).click();
  await j.getByRole('button', { name: 'Make a guess' }).click();
  await expect(j.getByRole('button', { name: 'Submit verdict & reveal' })).toBeDisabled();
  await j.getByRole('button', { name: 'Back to chat' }).click();
  await expect(j.getByLabel('Message the group')).toBeVisible();
  await j.getByRole('button', { name: 'Make a guess' }).click();
  await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await expect(j.getByRole('heading', { name: /Contestant [AB] wins!/ })).toBeVisible();
  await expect(h.getByRole('heading', { name: /Contestant [AB] wins!/ })).toBeVisible();
  await expect(h.getByLabel('Message the group')).toHaveCount(0);
  await humanContext.close();
  await judgeContext.close();
});

test('AI answers a shared live question before the human types', async ({ browser }) => {
  const { h, j, humanContext, judgeContext } = await participants(browser);
  const humanLabel = (await h.getByText(/YOU ARE CONTESTANT/).textContent())!.trim().slice(-1);
  const aiLabel = humanLabel === 'A' ? 'B' : 'A';

  await j.getByLabel('Message the group').fill('what is your name');
  await j.getByRole('button', { name: 'Send' }).click();
  await h.getByLabel('Message the group').fill('nik');
  await h.getByRole('button', { name: 'Send' }).click();
  await expect(j.getByLabel('Message the group')).toBeVisible();
  await j.getByLabel('Message the group').fill('whats the meaning of life');
  await j.getByRole('button', { name: 'Send', exact: true }).click();

  await expect
    .poll(
      () => j.getByLabel('Group chat').getByText(`Contestant ${aiLabel}`, { exact: true }).count(),
      { timeout: 45000 },
    )
    .toBeGreaterThanOrEqual(2);

  await expect(h.getByLabel('Message the group')).toHaveValue('');
  await j.getByRole('button', { name: 'Make a guess' }).click();
  await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await expect(j.getByRole('heading', { name: /Contestant B wins/ })).toBeVisible();
  await humanContext.close();
  await judgeContext.close();
});

test('composer preserves focus and drafts while sending is blocked', async ({ browser }) => {
  const { h, j, humanContext, judgeContext } = await participants(browser);
  const input = h.getByLabel('Message the group');

  await input.fill('my opening');

  const original = await input.elementHandle();

  await input.press('Enter');
  await expect(input).toHaveValue('my opening');
  await expect(input).toBeFocused();
  await expect(h.getByLabel('Group chat')).not.toContainText('my opening');

  await expect(
    h.getByText('Waiting for the judge to ask a question.', { exact: true }),
  ).toBeVisible();

  await h.screenshot({ path: 'work/player-empty-desktop.png' });
  await j.screenshot({ path: 'work/judge-empty-desktop.png' });
  await j.getByLabel('Message the group').fill('hi');
  await j.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(
    h.getByText('Your turn — answer the opening question.', { exact: true }),
  ).toBeVisible();

  await expect(input).toBeFocused();
  expect(await input.evaluate((node, original) => node === original, original)).toBe(true);
  await expect(input).toHaveValue('my opening');
  await input.press('Enter');
  await input.fill('next message draft');

  await expect(
    h.getByText('Chat with the group. Avoid being mistaken for AI.', { exact: true }),
  ).toBeVisible();

  await expect(input).toHaveValue('next message draft');
  await expect(input).toBeFocused();
  expect(await input.evaluate((node, original) => node === original, original)).toBe(true);
  await h.setViewportSize({ width: 390, height: 844 });
  await h.screenshot({ path: 'work/persistent-composer-mobile.png' });
  await j.getByRole('button', { name: 'Make a guess' }).click();
  await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await humanContext.close();
  await judgeContext.close();
});

test('home page shows creator links and a live score on desktop and mobile', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Marc', exact: true })).toHaveAttribute(
    'href',
    'https://x.com/marcbaghadjian',
  );

  await expect(page.getByRole('link', { name: 'Nik', exact: true })).toHaveAttribute(
    'href',
    'https://x.com/NikolasIoannou_',
  );

  await expect(page.getByRole('region', { name: 'Live game score' })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('link', { name: 'Marc', exact: true })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.screenshot({ path: `work/home-details-${viewport.width}.png`, fullPage: true });
  }
});

test('latest upstream names, ongoing opening and independent live reply', async ({ browser }) => {
  test.setTimeout(120000);

  const { h, j, humanContext, judgeContext } = await participants(browser);

  try {
    await j.getByLabel('Message the group').fill('what food do you love');
    await j.getByRole('button', { name: 'Send', exact: true }).click();
    await h.getByLabel('Message the group').fill('pizza');
    await h.getByRole('button', { name: 'Send', exact: true }).click();
    await h.getByLabel('Message the group').fill('especially with mushrooms');
    await h.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(j.getByRole('button', { name: 'Send', exact: true })).toBeDisabled(); // empty, not phase-blocked
    await j.getByLabel('Message the group').fill('tell me why');
    await expect(j.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await j.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(j.getByRole('button', { name: 'Make a guess', exact: true })).toBeVisible({
      timeout: 45000,
    });

    await expect(j.getByText('especially with mushrooms', { exact: true })).toBeVisible();

    const rows = j.getByLabel('Group chat');
    // Count contestant labels instead: message DOM can evolve independently of this journey.
    const countBefore = await rows.getByText(/^Contestant [AB]$/).count();

    await j.getByLabel('Message the group').fill('what do you do for fun');
    await j.getByRole('button', { name: 'Send', exact: true }).click();

    await expect
      .poll(() => rows.getByText(/^Contestant [AB]$/).count(), { timeout: 45000 })
      .toBeGreaterThan(countBefore);

    await expect(h.getByLabel('Message the group')).toHaveValue('');
    await h.reload();
    await expect(h.getByText('Judge: Marc.', { exact: false })).toBeVisible();
    await expect(h.getByLabel('Your first name')).toHaveCount(0);
    await j.getByRole('button', { name: 'Make a guess', exact: true }).click();
    await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
    await j.getByRole('button', { name: 'Submit verdict & reveal', exact: true }).click();
    await expect(j.getByRole('heading', { name: /Contestant .* wins!/ })).toBeVisible();
  } finally {
    await humanContext.close();
    await judgeContext.close();
  }
});

test('name entry keeps the mobile composer usable', async ({ browser }) => {
  const { h, j, humanContext, judgeContext } = await participants(browser);

  await h.setViewportSize({ width: 390, height: 844 });
  await expect(h.getByLabel('Message the group')).toBeEnabled();
  expect(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await h.screenshot({ path: 'work/name-entry-mobile.png' });
  await humanContext.close();
  await judgeContext.close();
});
