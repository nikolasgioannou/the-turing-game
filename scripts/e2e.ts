import { resolve } from 'node:path';
import { localModelConfig } from '../src/server/local-model';

try {
  const response = await fetch(localModelConfig().baseURL.replace(/\/$/, '') + '/models', {
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) throw new Error('Model service unavailable');
} catch {
  console.error(
    'Browser tests require the real local model. Start it with bun run ai:local, then retry.',
  );

  process.exit(1);
}

const child = Bun.spawn(['bun', 'run', 'playwright', 'test', ...process.argv.slice(2)], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: resolve('.cache/ms-playwright'),
    XDG_CACHE_HOME: resolve('.cache'),
  },
});

process.exit(await child.exited);
