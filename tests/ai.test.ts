import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { AIError, createAI, SYSTEM_PROMPT } from '../src/server/ai';
const input = {
  label: 'B' as const,
  question: 'how old are you',
  humanAnswer: 'old enough',
  history: [],
};
let server: ReturnType<typeof Bun.serve>,
  status = 200,
  calls = 0,
  body: any,
  missingUsage = false;
const keys = ['AI_MODE', 'AI_BASE_URL', 'AI_API_KEY', 'AI_DEVTOOLS', 'NODE_ENV'] as const;
const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      calls++;
      body = await req.json();
      if (status !== 200)
        return Response.json(
          { error: { message: 'fixture error', type: 'test', code: String(status) } },
          { status },
        );
      return Response.json({
        id: 'test-response',
        object: 'chat.completion',
        created: 1700000000,
        model: 'fixture-model',
        provider: 'fixture-provider',
        choices: [
          { index: 0, message: { role: 'assistant', content: '25 lol' }, finish_reason: 'stop' },
        ],
        ...(!missingUsage
          ? { usage: { prompt_tokens: 123, completion_tokens: 7, total_tokens: 130 } }
          : {}),
      });
    },
  });
  process.env.AI_MODE = 'live';
  process.env.AI_BASE_URL = `http://127.0.0.1:${server.port}/v1`;
  process.env.AI_API_KEY = 'test-only';
  process.env.AI_DEVTOOLS = 'false';
  process.env.NODE_ENV = 'test';
});
afterAll(async () => {
  await server.stop(true);
  for (const k of keys)
    if (previous[k] === undefined) delete process.env[k];
    else process.env[k] = previous[k];
});
describe('AI SDK adapter', () => {
  test('sends system and human context and preserves usage/provider identity', async () => {
    status = 200;
    missingUsage = false;
    calls = 0;
    const result = await createAI().complete(input, AbortSignal.timeout(5000));
    expect(calls).toBe(1);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.9);
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(JSON.parse(body.messages[1].content).humanAnswer).toBe('old enough');
    expect(result.text).toBe('25 lol');
    expect(result.usage).toEqual({ input: 123, output: 7 });
    expect(result.provider).toBe('fixture-provider');
    expect(result.model).toBe('fixture-model');
    expect(result.requestId).toBe('test-response');
  });
  test('does not retry credit failures and retains the circuit-breaker code', async () => {
    status = 402;
    calls = 0;
    let error: unknown;
    try {
      await createAI().complete(input, AbortSignal.timeout(5000));
    } catch (e) {
      error = e;
    }
    expect(calls).toBe(1);
    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).code).toBe('402');
    expect((error as AIError).retryMs).toBe(86_400_000);
  });
  test('missing token usage stays unknown for conservative ledger charging', async () => {
    status = 200;
    missingUsage = true;
    const result = await createAI().complete(input, AbortSignal.timeout(5000));
    expect(result.usage).toBeNull();
  });
  test('production refuses enabled trace capture', () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_DEVTOOLS = 'true';
    try {
      expect(() => createAI()).toThrow('local-only');
    } finally {
      process.env.NODE_ENV = 'test';
      process.env.AI_DEVTOOLS = 'false';
    }
  });
});
