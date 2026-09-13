import { resolve } from 'node:path';
const child = Bun.spawn(['bun', 'run', 'playwright', 'test', ...process.argv.slice(2)], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: resolve('.cache/ms-playwright'),
    XDG_CACHE_HOME: resolve('.cache'),
  },
});
process.exit(await child.exited);
