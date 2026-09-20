import { expect, test } from 'bun:test';
import { RequestLimiter, StartLimiter } from '../src/server/admission';

test('start limits survive session rotation but allow ordinary shared-network play', () => {
  let now = 0;
  const limits = new StartLimiter(() => now);

  for (let i = 0; i < 30; i++) limits.take([{ session: String(i), ip: '192.0.2.1' }]);

  expect(() => limits.take([{ session: 'new', ip: '192.0.2.1' }])).toThrow('3 seconds');
  limits.take([{ session: 'separate', ip: '192.0.2.2' }]);
  now = 3000;
  limits.take([{ session: 'new', ip: '192.0.2.1' }]);
});

test('failed pair admission consumes neither participant and replay replenishes', () => {
  let now = 0;
  const limits = new StartLimiter(() => now);

  for (let i = 0; i < 6; i++) limits.take([{ session: 'abuser' }]);

  expect(() => limits.take([{ session: 'normal' }, { session: 'abuser' }])).toThrow();

  for (let i = 0; i < 6; i++) limits.take([{ session: 'normal' }]);

  now = 90_000;
  limits.take([{ session: 'normal' }, { session: 'abuser' }]);
});

test('operator starts have a separate bounded burst', () => {
  const limits = new StartLimiter(() => 0);

  for (let i = 0; i < 20; i++) limits.take([], true);

  expect(() => limits.take([], true)).toThrow();
  limits.take([{ session: 'normal' }]);
});

test('model requests are bounded globally and per game without blocking other games', async () => {
  const limits = new RequestLimiter(2, 1, 3);
  const signal = new AbortController().signal;
  const releaseA = await limits.acquire('a', signal);
  let secondA = false;
  const pending = limits.acquire('a', signal).then((release) => {
    secondA = true;

    return release;
  });
  const releaseB = await limits.acquire('b', signal);

  expect(secondA).toBe(false);
  releaseA();

  const releaseA2 = await pending;

  expect(secondA).toBe(true);
  releaseA2();
  releaseB();
});

test('waiting requests cancel, queue overflow rejects, and releases are idempotent', async () => {
  const limits = new RequestLimiter(1, 1, 1);
  const controller = new AbortController();
  const release = await limits.acquire('a', controller.signal);
  const waiting = limits.acquire('b', controller.signal);

  await expect(limits.acquire('c', controller.signal)).rejects.toThrow('busy');
  controller.abort();
  await expect(waiting).rejects.toThrow('canceled');
  release();
  release();

  const next = await limits.acquire('c', new AbortController().signal);

  next();
});
