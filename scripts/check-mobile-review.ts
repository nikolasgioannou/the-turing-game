import { chromium, webkit } from '@playwright/test';
import { reviewExamples } from '../src/client/review/states';
import { mkdir } from 'node:fs/promises';

await mkdir('work/mobile-review', { recursive: true });

const server = Bun.spawn(
  [
    process.execPath,
    '--bun',
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5174',
    '--strictPort',
  ],
  { stdout: 'ignore', stderr: 'inherit' },
);

try {
  let ready = false;

  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error('Review server exited; check port 5174.');

    try {
      if ((await fetch('http://127.0.0.1:5174/review')).ok) {
        ready = true;
        break;
      }
    } catch {}

    await Bun.sleep(100);
  }

  if (!ready) throw Error('Review server did not start.');

  for (const engine of ['chromium', 'webkit'] as const) {
    const browser = await (engine === 'chromium'
      ? chromium.launch({ channel: 'chrome' })
      : webkit.launch());

    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors: string[] = [];

      page.on('pageerror', (e) => errors.push(e.message));

      for (const item of reviewExamples) {
        await page.goto('http://127.0.0.1:5174/review?frame=1&state=' + item.id);
        await page.locator('.app-shell').waitFor();
        await page.evaluate(() => document.fonts.ready);

        const dims = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));

        if (dims.width > dims.viewport + 1)
          throw Error(engine + ' ' + item.id + ' horizontal overflow ' + JSON.stringify(dims));
      }

      for (const state of [
        'chat-human',
        'chat-judge',
        'name-human',
        'verdict-judge',
        'result-human-win',
        'roles-public',
      ]) {
        for (const size of [
          { width: 320, height: 568 },
          { width: 844, height: 390 },
          { width: 1280, height: 900 },
        ]) {
          await page.setViewportSize(size);
          await page.goto('http://127.0.0.1:5174/review?frame=1&state=' + state);
          await page.locator('.app-shell').waitFor();
          await page.evaluate(() => document.fonts.ready);

          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
            throw Error(engine + ' ' + state + ' overflow ' + JSON.stringify(size));

          await page.screenshot({
            path: `work/mobile-review/${engine}-${state}-${size.width}.png`,
          });
        }
      }

      await page.setViewportSize({ width: 390, height: 844 });

      for (const state of ['chat-human', 'chat-judge', 'name-human', 'verdict-judge']) {
        await page.goto('http://127.0.0.1:5174/review?frame=1&state=' + state);

        const field = page.locator(
          state === 'name-human'
            ? '#first-name'
            : state === 'verdict-judge'
              ? '#reason'
              : '#message',
        );

        await field.fill('A draft that survives the keyboard');
        await field.focus();

        const expectedDraft = await field.inputValue();

        await page.evaluate(() => {
          const v = visualViewport!;

          Object.defineProperty(v, 'height', { configurable: true, get: () => 350 });
          Object.defineProperty(v, 'offsetTop', { configurable: true, get: () => 40 });
          v.dispatchEvent(new Event('resize'));
        });

        await page.waitForTimeout(100);

        const bounds = await field.boundingBox();

        if (!bounds || bounds.y < 40 || bounds.y + bounds.height > 391)
          throw Error(engine + ' ' + state + ' keyboard field clipped ' + JSON.stringify(bounds));

        if (state.startsWith('chat')) {
          const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();

          if (!send || send.y + send.height > 391) throw Error('Send clipped');

          if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1))
            throw Error('Outer chat page scrolls');
        }

        await page.screenshot({ path: `work/mobile-review/${engine}-${state}-keyboard.png` });

        await page.evaluate(() => {
          const v = visualViewport!;

          delete (v as any).height;
          delete (v as any).offsetTop;
          v.dispatchEvent(new Event('resize'));
        });

        if ((await field.inputValue()) !== expectedDraft) throw Error('Draft lost');
      }

      if (errors.length) throw Error(errors.join('\n'));

      console.log(
        engine +
          ': all ' +
          reviewExamples.length +
          ' states, narrow/landscape/desktop and keyboard viewport checks passed',
      );

      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  await server.exited;
}
