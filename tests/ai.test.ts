import { expect, test } from 'bun:test';
import {
  createAI,
  MODEL,
  openRouterBody,
  requestCompletion,
  retryDelay,
  type BotHooks,
} from '../src/server/ai';

const params = {
  system: 'EXACT system',
  messages: [{ role: 'user', content: 'EXACT context' }],
  max_tokens: 400,
};

function harness() {
  const requests: number[] = [];
  const hooks: BotHooks = {
    state: () => {},
    failed: () => {},
    beforeRequest: async () => {
      requests.push(requests.length);
    },
  };

  return { hooks, requests };
}

test('OpenRouter translation preserves content and configured token limits without sampling overrides', () => {
  expect(openRouterBody(params)).toEqual({
    model: MODEL,
    messages: [{ role: 'system', content: 'EXACT system' }, ...params.messages],
    max_tokens: 400,
    reasoning: { enabled: false },
    provider: { order: ['Anthropic'], allow_fallbacks: false },
  });

  expect(openRouterBody({ ...params, max_tokens: 500 }).max_tokens).toBe(500);
});

test('provider text is returned unchanged', async () => {
  const { hooks, requests } = harness();
  const fetcher = (async (url: any, options: any) => {
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.parse(options.body)).toEqual(openRouterBody(params));

    return Response.json({
      id: 'request-id',
      model: MODEL,
      choices: [{ message: { content: '{"send":false,"messages":[]}' } }],
      usage: { prompt_tokens: 17, completion_tokens: 9 },
    });
  }) as typeof fetch;

  expect(await requestCompletion(params, 6, new AbortController().signal, hooks, fetcher)).toBe(
    '{"send":false,"messages":[]}',
  );

  expect(requests).toHaveLength(1);
});

test('single transient transport retry checks match lifecycle before each request', async () => {
  const { hooks, requests } = harness();
  let calls = 0;
  const fetcher = (async () =>
    ++calls === 1
      ? new Response('', { status: 503 })
      : Response.json({ choices: [{ message: { content: 'ok' } }] })) as unknown as typeof fetch;

  expect(await requestCompletion(params, 6, new AbortController().signal, hooks, fetcher)).toBe(
    'ok',
  );

  expect(requests).toHaveLength(2);
});

test('authentication failures do not retry and cancellation does not dispatch', async () => {
  const { hooks, requests } = harness();

  await expect(
    requestCompletion(
      params,
      6,
      new AbortController().signal,
      hooks,
      (async () => new Response('', { status: 401 })) as unknown as typeof fetch,
    ),
  ).rejects.toThrow('openrouter_401');

  expect(requests).toHaveLength(1);

  const controller = new AbortController();

  controller.abort();
  await expect(requestCompletion(params, 6, controller.signal, hooks)).rejects.toThrow();
  expect(requests).toHaveLength(1);
});

test('missing API key fails clearly before spawning a worker', () => {
  const saved = process.env.OPENROUTER_API_KEY;

  delete process.env.OPENROUTER_API_KEY;

  try {
    expect(() => createAI().start('test', 'A', harness().hooks)).toThrow('OPENROUTER_API_KEY');
  } finally {
    if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
  }
});

test('real TypeScript worker bridges opening and live replies, then cancels on closure', async () => {
  const saved = process.env.OPENROUTER_API_KEY;

  process.env.OPENROUTER_API_KEY = 'test-key-never-sent';

  const states: import('../src/server/ai').BotState[] = [],
    calls: any[] = [];
  const { hooks } = harness();
  const failures: Error[] = [];

  hooks.state = (s) => states.push(s);
  hooks.failed = (e) => failures.push(e);

  const fetcher = (async (_url: any, options: any) => {
    const body = JSON.parse(options.body);

    calls.push(body);

    const reply =
      body.max_tokens === 500
        ? 'brief lowercase ordinary texting, no punctuation'
        : JSON.stringify({
            send: true,
            messages: [
              states.some((s) => s.phase === 'live') ? 'probably family' : 'maybe its trust',
            ],
            draft_reveals_answer: false,
          });

    return Response.json({
      choices: [{ message: { content: reply } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
  }) as typeof fetch;
  const bot = createAI({ fetcher }).start('integration', 'A', hooks);
  const until = async (predicate: () => boolean) => {
    const deadline = Date.now() + 25000;

    while (!predicate() && Date.now() < deadline && !failures.length) await Bun.sleep(50);

    expect(failures).toEqual([]);
    expect(predicate()).toBe(true);
  };

  try {
    bot.send({ type: 'context', role: 'judge', name: 'Marc' });

    bot.send({
      type: 'context',
      role: 'player',
      name: 'Nik',
      hints: { mobile: 'true', platform: 'iPhone', tz: 'America/New_York' },
    });

    bot.send({ type: 'message', role: 'judge', text: 'what is love' });
    bot.send({ type: 'draft', text: 'i guess love is just caring for ppl' });
    bot.send({ type: 'message', role: 'player', text: 'i guess love is just caring for ppl' });

    await until(() =>
      states.some((s) => s.phase === 'live' && s.messages.some((m) => m.from === 'B')),
    );

    bot.send({ type: 'message', role: 'judge', text: 'who taught you that' });
    await until(() => states.some((s) => s.messages.filter((m) => m.from === 'B').length >= 2));
    expect(calls.every((c) => c.model === MODEL && [400, 500].includes(c.max_tokens))).toBe(true);
    expect(calls.some((c) => c.max_tokens === 500)).toBe(true);
    expect(calls.some((c) => JSON.stringify(c).includes('on a phone (iPhone)'))).toBe(true);

    expect(
      calls.some(
        (c) =>
          JSON.stringify(c).includes('human’s first name is Nik') ||
          JSON.stringify(c).includes("human's first name is Nik"),
      ),
    ).toBe(true);

    expect(
      calls
        .filter((c) => c.max_tokens === 400)
        .every((c) => c.messages[0].content.includes('You are Player B. The human is Player A.')),
    ).toBe(true);
  } finally {
    bot.stop();
    await Bun.sleep(100);

    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  }
}, 60000);

test('canceling an in-flight provider call aborts transport', async () => {
  const { hooks, requests } = harness();
  const controller = new AbortController();
  let dispatched!: () => void;
  const started = new Promise<void>((resolve) => {
    dispatched = resolve;
  });
  const fetcher = ((_url: any, options: any) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      dispatched();
    })) as typeof fetch;
  const result = requestCompletion(params, 6, controller.signal, hooks, fetcher);

  await started;
  controller.abort();
  await expect(result).rejects.toThrow('aborted');
  expect(requests).toHaveLength(1);
});

test('transport honors SDK retry hints and rejects excessive retry-after waits', () => {
  expect(retryDelay(new Headers({ 'retry-after-ms': '1250' }))).toBe(1250);
  expect(retryDelay(new Headers({ 'retry-after': '2' }))).toBe(2000);

  const delay = retryDelay(new Headers({ 'retry-after': '120' }));

  expect(delay).toBeGreaterThanOrEqual(375);
  expect(delay).toBeLessThanOrEqual(500);
});

test('closed match prevents provider dispatch', async () => {
  const { hooks } = harness();

  hooks.beforeRequest = async () => {
    throw new Error('match_closed');
  };

  let called = false;
  const fetcher = (async () => {
    called = true;

    return new Response();
  }) as unknown as typeof fetch;

  await expect(
    requestCompletion(params, 6, new AbortController().signal, hooks, fetcher),
  ).rejects.toThrow('match_closed');

  expect(called).toBe(false);
});

test('credit exhaustion is reported immediately and never retried even with a retry hint', async () => {
  const { hooks } = harness();
  let reported = 0,
    calls = 0;

  hooks.creditExhausted = () => {
    reported++;
  };

  const fetcher = (async () => {
    calls++;

    return new Response('', { status: 402, headers: { 'x-should-retry': 'true' } });
  }) as unknown as typeof fetch;

  await expect(
    requestCompletion(params, 6, new AbortController().signal, hooks, fetcher),
  ).rejects.toThrow('openrouter_402');

  expect(calls).toBe(1);
  expect(reported).toBe(1);
});
