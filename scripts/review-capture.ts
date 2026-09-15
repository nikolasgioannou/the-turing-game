import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { reviewExamples } from '../src/client/review/states';

const output = resolve('work/ui-review');
const port = 5175;
const base = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  [
    process.execPath,
    '--bun',
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { stdout: 'ignore', stderr: 'inherit' },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  let ready = false;

  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Review server exited; check port 5175.');

    try {
      if ((await fetch(base + '/review')).ok) {
        ready = true;
        break;
      }
    } catch {}

    await Bun.sleep(100);
  }

  if (!ready) throw new Error('Review server did not start.');

  await mkdir(output, { recursive: true });

  browser = await chromium.launch({
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined),
  });

  const gallery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await gallery.goto(base + '/review');
  await gallery.getByRole('combobox', { name: 'Preview size' }).click();
  await gallery.getByRole('option', { name: 'Mobile · 390px' }).click();
  await gallery.getByRole('button', { name: /Time up: human/ }).click();

  await gallery
    .frameLocator('iframe')
    .getByRole('dialog', { name: 'Waiting for the judge' })
    .waitFor();

  await gallery.screenshot({ path: resolve(output, 'gallery.png'), fullPage: true });
  await gallery.close();

  const cards: string[] = [];

  for (const size of ['desktop', 'mobile'] as const) {
    const context = await browser.newContext({
      viewport: size === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));

    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/'))
        errors.push('Unexpected API request: ' + request.url());
    });

    for (const item of reviewExamples) {
      await page.goto(`${base}/review?frame=1&state=${item.id}`);
      await page.locator('.app-shell').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);

      const filename = `${item.id}-${size}.png`;

      await page.screenshot({
        path: resolve(output, filename),
        fullPage: true,
        animations: 'disabled',
      });

      if (errors.length) throw new Error(`${item.id}: ${errors.join('; ')}`);

      cards.push(
        `<article><h2>${item.title} · ${size}</h2><p>${item.id}</p><a href="${filename}" target="_blank"><img loading="lazy" src="${filename}" alt="${item.title} — ${size}"></a></article>`,
      );

      console.log(`Captured ${item.id} (${size})`);
    }

    await context.close();
  }

  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Turing Game UI screenshots</title><style>body{background:#0b1215;color:#eee;font:16px monospace;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{border:1px solid #39484e;padding:16px;min-width:0}h2{font-size:16px}img{width:100%;height:440px;object-fit:contain;object-position:top;background:#05090b}p{color:#8aafb9}a{color:#4bd3ff}</style><h1>UI screenshots</h1><p>${reviewExamples.length} states · desktop and mobile · Click any screenshot for full size.</p><main>${cards.join('')}</main>`,
  );

  console.log(`Screenshot gallery: ${resolve(output, 'index.html')}`);
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
