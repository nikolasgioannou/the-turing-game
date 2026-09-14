import { resolve } from 'node:path';

export function localModelConfig() {
  const baseURL = process.env.LOCAL_AI_URL ?? 'http://127.0.0.1:8080/v1';
  const url = new URL(baseURL);

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error('LOCAL_AI_URL must point to a local loopback model service.');

  return {
    baseURL,
    model:
      process.env.LOCAL_AI_MODEL ??
      resolve(import.meta.dir, '../../models/huihui-qwen3.6-35b-4bit'),
  };
}
