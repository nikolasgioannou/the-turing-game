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
  await expect(j.getByRole('dialog', { name: 'Your first name' })).toHaveCount(0);
  await expect(h.getByRole('dialog', { name: 'Your first name' })).toHaveCount(0);
  await expect(j.getByLabel('Message the group')).toBeVisible();
  await expect(h.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  return { h, j, humanContext, judgeContext };
}

test('full multiplayer match and private participant results', async ({ browser }) => {
  test.setTimeout(120_000);

  const { h, j, humanContext, judgeContext } = await participants(browser);
  const humanLabel = (await h.getByLabel('Your contestant').textContent())!.trim().slice(-1);

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
  await expect(j.getByText('mushrooms', { exact: true })).toBeVisible();
  await expect(h.getByLabel('Message the group')).toHaveValue('');
  await j.screenshot({ path: 'work/chat-desktop.png', fullPage: true });
  await h.setViewportSize({ width: 390, height: 844 });
  await h.screenshot({ path: 'work/chat-mobile.png', fullPage: true });
  expect(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await expect(j.getByRole('button', { name: 'Submit verdict & reveal' })).toBeVisible({
    timeout: 95_000,
  });

  await expect(h.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  await j.getByRole('button', { name: `Contestant ${humanLabel}`, exact: true }).click();

  await j.getByLabel('What gave them away?').fill('They kept it simple.');
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();

  await expect(j.getByRole('heading', { name: 'You won!' })).toBeVisible();

  await expect(j.getByText('They kept it simple.', { exact: false })).toBeVisible();
  await expect(j.getByText('Audience guesses')).toHaveCount(0);
  await j.screenshot({ path: 'work/match-desktop.png', fullPage: true });

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
  const label = await h.getByLabel('Your contestant').textContent();

  await h.reload();
  await j.reload();
  await expect(j.getByLabel('Message the group')).toBeEnabled();
  await expect(h.getByLabel('Your contestant')).toHaveText(label!);
  await j.getByLabel('Message the group').fill('hi');
  await j.getByRole('button', { name: /Send/ }).click();
  await h.getByLabel('Message the group').fill('hey');
  await h.getByRole('button', { name: /Send/ }).click();

  await expect(
    h.getByText('Chat with the group. Avoid being mistaken for AI.', { exact: false }),
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
  await expect(restored.getByLabel('Your contestant')).toHaveText(label!);
  await expect(restored.getByText('back after reconnect', { exact: true })).toBeVisible();
  await expect(j.getByText(/A player disconnected/)).toHaveCount(0);
  await j.getByRole('button', { name: 'Make a guess' }).click();
  await j.getByRole('button', { name: 'Contestant A', exact: true }).click();
  await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();
  await expect(j.getByRole('heading', { name: /You (won!|lost\.)/ })).toBeVisible();

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
  await expect(j.getByRole('heading', { name: /You (won!|lost\.)/ })).toBeVisible();

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
  await expect(j.getByRole('heading', { name: /You (won!|lost\.)/ })).toBeVisible();
  await expect(h.getByRole('heading', { name: /You (won!|lost\.)/ })).toBeVisible();
  await expect(h.getByLabel('Message the group')).toHaveCount(0);
  await humanContext.close();
  await judgeContext.close();
});

test('AI answers a shared live question before the human types', async ({ browser }) => {
  const { h, j, humanContext, judgeContext } = await participants(browser);
  const humanLabel = (await h.getByLabel('Your contestant').textContent())!.trim().slice(-1);
  const aiLabel = humanLabel === 'A' ? 'B' : 'A';

  await j.getByLabel('Message the group').fill('what is your name');
  await j.getByRole('button', { name: 'Send' }).click();
  await h.getByLabel('Message the group').fill('nik');
  await h.getByRole('button', { name: 'Send' }).click();
  await expect(j.getByRole('button', { name: 'Make a guess' })).toBeVisible();
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
  await expect(j.getByRole('heading', { name: /You (won!|lost\.)/ })).toBeVisible();
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
    h.getByText('Waiting for the judge to ask a question.', { exact: false }),
  ).toBeVisible();

  await h.screenshot({ path: 'work/player-empty-desktop.png' });
  await j.screenshot({ path: 'work/judge-empty-desktop.png' });
  await j.getByLabel('Message the group').fill('hi');
  await j.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(
    h.getByText('Your turn — answer the opening question.', { exact: false }),
  ).toBeVisible();

  await expect(input).toBeFocused();
  expect(await input.evaluate((node, original) => node === original, original)).toBe(true);
  await expect(input).toHaveValue('my opening');
  await input.press('Enter');
  await input.fill('next message draft');

  await expect(
    h.getByText('Chat with the group. Avoid being mistaken for AI.', { exact: false }),
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

test('names, ongoing opening and independent live reply', async ({ browser }) => {
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
    await expect(j.getByRole('heading', { name: /You (won!|lost\.)/ })).toBeVisible();
  } finally {
    await humanContext.close();
    await judgeContext.close();
  }
});

test('name entry keeps the mobile composer usable', async ({ browser }) => {
  const { h, humanContext, judgeContext } = await participants(browser);

  await h.setViewportSize({ width: 390, height: 844 });
  await expect(h.getByLabel('Message the group')).toBeEnabled();
  expect(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await h.screenshot({ path: 'work/name-entry-mobile.png' });
  await humanContext.close();
  await judgeContext.close();
});

test('missing static assets are 404s and normal draft bursts keep the socket open', async ({
  page,
  request,
}) => {
  const response = await request.get('/assets/missing.js');

  expect(response.status()).toBe(404);
  expect(response.headers()['cache-control']).not.toContain('immutable');
  await page.goto('/');

  const result = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const timer = setTimeout(() => {
          ws.close();
          reject(Error('No pong'));
        }, 5000);

        ws.onopen = () => {
          for (let n = 0; n < 85; n++) ws.send(JSON.stringify({ type: 'draft', text: 'typing' }));

          ws.send(JSON.stringify({ type: 'ping' }));
        };

        ws.onmessage = (e) => {
          if (JSON.parse(e.data).type === 'pong') {
            clearTimeout(timer);
            resolve('pong');
            ws.close();
          }
        };

        ws.onclose = () => {
          clearTimeout(timer);
          reject(Error('Disconnected during normal draft rate'));
        };
      }),
  );

  expect(result).toBe('pong');
});

test('leaving name entry returns to the lobby without a late room reopening', async ({
  browser,
}) => {
  const hc = await browser.newContext(),
    jc = await browser.newContext();
  const h = await hc.newPage(),
    j = await jc.newPage();

  try {
    await h.goto('/');
    await j.goto('/');
    await h.getByRole('button', { name: 'Start game', exact: true }).click();
    await h.getByRole('button', { name: /Play as human/ }).click();
    await j.getByRole('button', { name: 'Start game', exact: true }).click();
    await j.getByRole('button', { name: /Play as judge/ }).click();
    await h.getByLabel('First name', { exact: true }).waitFor();
    h.on('dialog', (dialog) => dialog.accept());
    await h.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(h.getByRole('button', { name: 'Start game', exact: true })).toBeVisible();

    await expect(
      j.getByText('A player left. This match was not counted.', { exact: true }),
    ).toBeVisible();

    await expect(h.getByRole('button', { name: 'Start game', exact: true })).toBeVisible();
    await expect(h).toHaveURL('/');
  } finally {
    await hc.close();
    await jc.close();
  }
});

test('invitation copying works without the secure-context clipboard API', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });

    document.execCommand = (command: string) => {
      if (command === 'copy') {
        (window as any).copiedLink = (document.activeElement as HTMLTextAreaElement).value;

        return true;
      }

      return false;
    };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click();
  await page.getByRole('button', { name: /Play as human/ }).click();

  const link = await page.getByLabel('Invitation link').inputValue();

  await page.getByRole('button', { name: 'Copy invitation', exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedLink)).toBe(link);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('malformed messages still obey socket rate limits', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => fetch('/api/session'));

  const code = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(Error('Socket stayed open'));
        }, 5000);

        ws.onopen = () => {
          for (let n = 0; n < 61; n++) ws.send('{');
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          resolve(event.code);
        };
      }),
  );

  expect(code).toBe(1008);
});

test('old public match URLs and APIs do not expose games', async ({ page, request }) => {
  const id = '11111111-1111-4111-8111-111111111111';

  expect((await request.get(`/api/matches/${id}`)).status()).toBe(404);
  expect((await request.get(`/match/${id}`)).status()).toBe(404);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible();
});

for (const correct of [true, false]) {
  test(`personal results and clean chat controls: ${correct ? 'win' : 'loss'}`, async ({
    browser,
  }) => {
    const { h, j, humanContext, judgeContext } = await participants(browser);
    const humanLabel = (await h.getByLabel('Your contestant').textContent())!.trim().slice(-1);

    await j.getByLabel('Message the group').fill('what food do you like?');
    await j.getByRole('button', { name: 'Send', exact: true }).click();
    await h.getByLabel('Message the group').fill('pizza');
    await h.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(j.getByRole('timer')).toBeVisible();
    await expect(j.getByText('500 characters remaining')).toHaveCount(0);
    await expect(j.getByText('Refreshing keeps your seat.')).toHaveCount(0);
    await expect(j.getByText('YOU ARE THE JUDGE')).toHaveCount(0);
    await expect(j.getByRole('log').locator('svg')).toHaveCount(0);

    for (const width of [1280, 390]) {
      for (const page of [j, h]) {
        await page.setViewportSize({ width, height: 844 });

        const toolbar = await page.locator('header[aria-label="Match controls"]').boundingBox();
        const timer = await page.getByRole('timer').boundingBox();

        expect(
          Math.abs(timer!.x + timer!.width / 2 - (toolbar!.x + toolbar!.width / 2)),
        ).toBeLessThan(2);

        await expect(page.getByLabel('Message the group')).toBeInViewport();

        await page.screenshot({
          path: `work/clean-${page === j ? 'judge' : 'player'}-${width}.png`,
        });
      }

      await expect(
        j
          .locator('header[aria-label="Match controls"]')
          .getByRole('button', { name: 'Make a guess' }),
      ).toBeVisible();
    }

    await j.getByLabel('Message the group').fill('x'.repeat(450));
    await expect(j.getByText('50 characters remaining')).toBeVisible();
    await j.getByLabel('Message the group').fill('x'.repeat(501));
    await expect(j.getByText('1 characters over limit')).toBeVisible();
    await expect(j.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await j.getByLabel('Message the group').fill('unsent question');
    await j.getByRole('button', { name: 'Make a guess' }).click();
    await expect(j.getByLabel('Message the group')).toBeHidden();
    await expect(j.getByRole('heading', { name: 'Who is the bot?' })).toBeVisible();
    await j.getByRole('button', { name: 'Back to chat' }).click();
    await expect(j.getByLabel('Message the group')).toHaveValue('unsent question');
    await j.getByRole('button', { name: 'Make a guess' }).click();
    await expect(j.getByLabel('Message the group')).toBeHidden();

    await j
      .getByRole('button', {
        name: `Contestant ${!correct ? humanLabel : humanLabel === 'A' ? 'B' : 'A'}`,
        exact: true,
      })
      .click();

    await j.getByRole('button', { name: 'Submit verdict & reveal' }).click();

    for (const page of [j, h]) {
      await expect(
        page.getByRole('heading', { name: correct ? 'You won!' : 'You lost.', exact: true }),
      ).toBeVisible();

      await expect(page.getByRole('log').locator('svg').first()).toBeVisible();

      await page.screenshot({
        path: `work/result-${page === j ? 'judge' : 'player'}-${correct ? 'win' : 'loss'}.png`,
        fullPage: true,
      });
    }

    await humanContext.close();
    await judgeContext.close();
  });
}

for (const fixedRole of ['human', 'judge'] as const) {
  test(`either role fills the opposite of a waiting ${fixedRole}`, async ({ browser }) => {
    const fixedContext = await browser.newContext();
    const flexibleContext = await browser.newContext({ viewport: { width: 390, height: 844 } });

    try {
      const fixed = await fixedContext.newPage();
      const flexible = await flexibleContext.newPage();

      await fixed.goto('/');
      await fixed.getByRole('button', { name: 'Start game', exact: true }).click();
      await fixed.getByRole('button', { name: `Play as ${fixedRole}`, exact: false }).click();
      await flexible.goto('/');
      await flexible.getByRole('button', { name: 'Start game', exact: true }).click();
      await flexible.screenshot({ path: 'work/either-role-mobile.png' });

      await expect(
        flexible.getByRole('button', { name: 'Either role', exact: false }),
      ).toBeInViewport();

      await flexible.getByRole('button', { name: 'Invite a friend', exact: true }).click();

      await expect(
        flexible.getByRole('button', { name: 'Either role', exact: false }),
      ).toBeVisible();

      await flexible.getByRole('button', { name: 'Find a match', exact: true }).click();
      await flexible.getByRole('button', { name: 'Either role', exact: false }).click();

      for (const page of [fixed, flexible]) {
        await page.getByLabel('First name', { exact: true }).fill('Test');
        await page.getByRole('button', { name: 'Enter', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Your first name' })).toHaveCount(0);
      }

      const human = fixedRole === 'human' ? fixed : flexible;
      const judge = fixedRole === 'judge' ? fixed : flexible;

      await expect(human.getByLabel('Your contestant')).toBeVisible();
      await expect(judge.getByLabel('Your contestant')).toHaveCount(0);
      await judge.getByLabel('Message the group').fill('hello');
      await expect(judge.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
      await human.getByLabel('Message the group').fill('hello');
      await expect(human.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    } finally {
      await fixedContext.close();
      await flexibleContext.close();
    }
  });
}

test('either role creates a friend invitation with complementary seats', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const friendContext = await browser.newContext();

  try {
    const host = await hostContext.newPage();
    const friend = await friendContext.newPage();

    await host.goto('/');
    await host.getByRole('button', { name: 'Start game', exact: true }).click();
    await host.getByRole('button', { name: 'Invite a friend', exact: true }).click();
    await host.getByRole('button', { name: 'Either role', exact: false }).click();

    const link = await host.getByLabel('Invitation link').inputValue();

    await friend.goto(link);

    for (const page of [host, friend]) {
      await page.getByLabel('First name', { exact: true }).fill('Test');
      await page.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Your first name' })).toHaveCount(0);
    }

    const hostIsHuman = await host.getByLabel('Your contestant').count();
    const human = hostIsHuman ? host : friend;
    const judge = hostIsHuman ? friend : host;

    await expect(human.getByLabel('Your contestant')).toBeVisible();
    await expect(judge.getByLabel('Your contestant')).toHaveCount(0);
    await judge.getByLabel('Message the group').fill('hello');
    await expect(judge.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await human.getByLabel('Message the group').fill('hello');
    await expect(human.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  } finally {
    await hostContext.close();
    await friendContext.close();
  }
});
