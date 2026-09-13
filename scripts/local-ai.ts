import { resolve } from 'node:path';

// Keep inference, model weights and every runtime cache inside this checkout.
const root = resolve(import.meta.dir, '..');
const model = resolve(root, 'models/huihui-qwen3.6-35b-4bit');
const env = {
  ...process.env,
  HF_HOME: resolve(root, '.cache/huggingface'),
  XDG_CACHE_HOME: resolve(root, '.cache'),
  HF_HUB_OFFLINE: '1',
  MPLCONFIGDIR: resolve(root, '.cache/matplotlib'),
};
const game = process.argv[2] === 'game';
if (!(await Bun.file(resolve(model, 'model.safetensors.index.json')).exists()))
  throw new Error('Download the local model first; see docs/local-ai.md.');
const index = await Bun.file(resolve(model, 'model.safetensors.index.json')).json();
for (const shard of new Set<string>(Object.values(index.weight_map))) {
  if (!(await Bun.file(resolve(model, shard)).exists()))
    throw new Error(`Model download incomplete: missing ${shard}`);
}
const cmd = game
  ? [process.execPath, 'src/server/index.ts']
  : [
      resolve(root, '.venv/bin/python'),
      '-m',
      'mlx_vlm.server',
      '--host',
      '127.0.0.1',
      '--port',
      '8080',
      '--model',
      model,
      '--max-tokens',
      '512',
      '--max-kv-size',
      '8192',
      '--max-num-seqs',
      '1',
      '--log-level',
      'WARNING',
    ];
const child = Bun.spawn(cmd, {
  cwd: root,
  env: game
    ? {
        ...env,
        AI_MODE: 'live',
        AI_BASE_URL: 'http://127.0.0.1:8080/v1',
        AI_MODEL: model,
        AI_API_KEY: 'local-development',
      }
    : env,
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
process.exitCode = await child.exited;
