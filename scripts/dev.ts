const children = [
  Bun.spawn(['bun', '--watch', 'src/server/index.ts'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: {
      ...process.env,
      AI_MODE: process.env.AI_MODE ?? 'mock',
      APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:5173',
    },
  }),
  Bun.spawn(['bun', 'run', 'dev:client'], { stdio: ['inherit', 'inherit', 'inherit'] }),
];
process.on('SIGINT', () => {
  children.forEach((p) => p.kill());
  process.exit();
});
await Promise.all(children.map((p) => p.exited));
export {};
