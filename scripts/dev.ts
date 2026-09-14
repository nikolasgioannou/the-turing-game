// Run Vite HMR and the watched API server together on loopback interfaces.
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '3000',
  APP_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: '',
  PGLITE_PATH: './data/local',
};
const children = [
  Bun.spawn([process.execPath, '--watch', 'src/server/index.ts'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env,
  }),
  Bun.spawn([process.execPath, 'node_modules/vite/bin/vite.js'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env,
  }),
];
let stopping = false;

function stop() {
  if (stopping) return;

  stopping = true;

  for (const child of children) child.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop);

const code = await Promise.race(children.map((child) => child.exited));
const interrupted = stopping;

stop();
await Promise.all(children.map((child) => child.exited));
process.exitCode = interrupted ? 0 : code;
export {};
