import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { IdentityIcon } from '../src/client/ui/identity-icon';

// Export the same portraits used in the UI; no separate icon geometry to maintain.
const portrait = (kind: 'human' | 'bot') => renderToStaticMarkup(<IdentityIcon kind={kind} />);
const font = Buffer.from(await Bun.file('public/fonts/press-start.ttf').arrayBuffer()).toString(
  'base64',
);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Arcade; src: url(data:font/ttf;base64,${font}); }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1200px; height: 630px; background: #080b0d; color: #f8eacb; --color-canvas: #080b0d; }
    main { position: relative; margin: 24px; height: 582px; border: 3px solid #ff682e; background: radial-gradient(ellipse at 50% 0%, #203039, #080b0d 75%); text-align: center; padding: 44px 30px; box-shadow: 7px 7px #47291d; }
    .eyebrow { font: 16px Arcade; letter-spacing: 3px; color: #9cabae; }
    h1 { font: 900 italic 112px/.95 Impact, 'Arial Black', sans-serif; letter-spacing: -3px; color: #ff863e; text-shadow: 4px 5px #aa341b, 7px 9px #311d17; margin: 36px 0 26px; transform: rotate(-3deg); }
    h1 span { display: block; font-size: 38px; color: #ffc76b; letter-spacing: 0; }
    .tagline { font: 20px/1.6 Arcade; margin: 0; }
    .duel { display: flex; align-items: center; justify-content: center; gap: 64px; margin-top: 32px; }
    svg { width: 96px; height: 96px; }
    .human { color: #ff803b; } .bot { color: #4bd3ff; }
    .question { font: 42px Arcade; color: #edcd83; }
    footer { position: absolute; bottom: 24px; left: 0; right: 0; font: 18px 'Courier New', monospace; color: #9cabae; }
  </style></head><body><main>
    <div class="eyebrow">HUMAN VS MACHINE</div>
    <h1><span>THE</span>TURING GAME</h1>
    <p class="tagline">ONE HUMAN. ONE AI. FIND THE BOT.</p>
    <div class="duel"><div class="human">${portrait('human')}</div><div class="question">?</div><div class="bot">${portrait('bot')}</div></div>
    <footer>theturinggame.ai</footer>
  </main></body></html>`);

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'public/social-card.png' });

  const icon = portrait('bot')
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('viewBox="0 0 16 16"', 'viewBox="-2 -2 20 20"')
    .replaceAll('currentColor', '#4bd3ff')
    .replaceAll('var(--color-canvas)', '#080b0d');

  await Bun.write('public/favicon.svg', icon);
  await page.setViewportSize({ width: 180, height: 180 });

  await page.setContent(
    `<style>body{margin:0;background:#080b0d}svg{width:180px;height:180px}</style>${icon}`,
  );

  await page.screenshot({ path: 'public/apple-touch-icon.png' });
  await page.setViewportSize({ width: 32, height: 32 });
  await page.addStyleTag({ content: 'svg{width:32px;height:32px}' });
  await page.screenshot({ path: 'public/favicon-32.png' });
} finally {
  await browser.close();
}
