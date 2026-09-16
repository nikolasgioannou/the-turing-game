import { expect, test } from 'bun:test';
import { ProviderAvailability, CAPACITY_MESSAGE } from '../src/server/provider-availability';

function harness() {
  let now = 1000;
  let response: () => Promise<Response> = async () =>
    Response.json({ data: { limit: 5, limit_remaining: 3 } });
  let calls = 0;
  const monitor = new ProviderAvailability(
    (async (url, init) => {
      calls++;
      expect(url).toBe('https://openrouter.ai/api/v1/key');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-key');

      return response();
    }) as typeof fetch,
    () => now,
    () => 'test-key',
  );

  return {
    monitor,
    calls: () => calls,
    advance: () => {
      now += 30_001;
    },
    respond: (fn: typeof response) => {
      response = fn;
    },
  };
}

test('provider checks coalesce and cache, exhaust and automatically recover', async () => {
  const h = harness();

  expect(h.monitor.message).not.toBeNull();
  await Promise.all([h.monitor.refresh(), h.monitor.refresh(), h.monitor.refresh()]);
  expect(h.calls()).toBe(1);
  expect(h.monitor.message).toBeNull();
  await h.monitor.refresh();
  expect(h.calls()).toBe(1);
  h.advance();
  h.respond(async () => Response.json({ data: { limit: 5, limit_remaining: 0 } }));
  await h.monitor.refresh();
  expect(h.monitor.message).toBe(CAPACITY_MESSAGE);
  h.advance();
  h.respond(async () => Response.json({ data: { limit: 5, limit_remaining: 5 } }));
  await h.monitor.refresh();
  expect(h.monitor.message).toBeNull();
});

test('unlimited is valid; missing, malformed and failed checks cannot admit new games', async () => {
  const h = harness();

  h.respond(async () => Response.json({ data: { limit: null, limit_remaining: null } }));
  await h.monitor.refresh();
  expect(h.monitor.message).toBeNull();

  for (const body of [
    {},
    { data: { limit: 5 } },
    { data: { limit: 5, limit_remaining: null } },
    { data: { limit_remaining: '5' } },
  ]) {
    h.advance();
    h.respond(async () => Response.json(body));
    await h.monitor.refresh();
    expect(h.monitor.message).not.toBeNull();
    expect(h.monitor.exhausted).toBe(false);
  }

  h.advance();

  h.respond(async () => {
    throw new Error('offline');
  });

  await h.monitor.refresh();
  expect(h.monitor.message).not.toBeNull();
});

test('402 overrides a pending positive check and failed refreshes cannot clear exhaustion', async () => {
  const h = harness();
  let resolve!: (value: Response) => void;

  h.respond(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );

  const pending = h.monitor.refresh();

  h.monitor.reportExhausted();
  resolve(Response.json({ data: { limit: 5, limit_remaining: 4 } }));
  await pending;
  expect(h.monitor.exhausted).toBe(true);
  h.advance();
  h.respond(async () => new Response('', { status: 503 }));
  await h.monitor.refresh();
  expect(h.monitor.exhausted).toBe(true);
  h.advance();
  h.respond(async () => Response.json({ data: { limit: 5, limit_remaining: 2 } }));
  await h.monitor.refresh();
  expect(h.monitor.exhausted).toBe(false);
});

test('402 from key endpoint also reports exhausted capacity', async () => {
  const h = harness();

  h.respond(async () => new Response('', { status: 402 }));
  await h.monitor.refresh();
  expect(h.monitor.exhausted).toBe(true);
});

test('reset hints only follow confirmed key exhaustion and use UTC boundaries', async () => {
  const now = Date.UTC(2026, 8, 15, 18);

  for (const [period, expected] of [
    ['daily', Date.UTC(2026, 8, 16)],
    ['weekly', Date.UTC(2026, 8, 21)],
    ['monthly', Date.UTC(2026, 9, 1)],
    [null, undefined],
  ] as const) {
    const monitor = new ProviderAvailability(
      (async () =>
        Response.json({
          data: { limit: 5, limit_remaining: 0, limit_reset: period },
        })) as unknown as typeof fetch,
      () => now,
      () => 'key',
    );

    await monitor.refresh();
    expect(monitor.resetsAt).toBe(expected);
    expect(monitor.message?.includes('Come back tomorrow')).toBe(period === 'daily');
    monitor.reportExhausted();
    expect(monitor.resetsAt).toBeUndefined();
    expect(monitor.message).toBe(CAPACITY_MESSAGE);
  }

  const monitor = new ProviderAvailability(
    (async () =>
      Response.json({
        data: { limit: 5, limit_remaining: 4, limit_reset: 'daily' },
      })) as unknown as typeof fetch,
    () => now,
    () => 'key',
  );

  await monitor.refresh();
  expect(monitor.resetsAt).toBeUndefined();
});
