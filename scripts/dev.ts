// Build and serve the game with OpenRouter.
const build = Bun.spawn(['bun', 'run', 'build'], { stdio: ['inherit', 'inherit', 'inherit'] });

if (await build.exited) process.exit(1);

const port = process.env.DEV_PORT ?? '3000';
const child = Bun.spawn(['bun', 'run', 'start'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PORT: port,
    APP_ORIGIN: process.env.DEV_APP_ORIGIN ?? `http://localhost:${port}`,
    PGLITE_PATH: './data/wifi',
  },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));

process.exitCode = await child.exited;
export {};
