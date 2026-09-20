import { expect, test } from 'bun:test';
import { Readiness } from '../src/server/readiness';

test('readiness bounds hung dependencies and coalesces callers until recovery', async () => {
  let resolve!: () => void;
  let calls = 0;
  let now = 0;
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  const readiness = new Readiness(
    () => {
      calls++;

      return gate;
    },
    () => now,
    5,
  );

  expect(await Promise.all([readiness.check(), readiness.check()])).toEqual([false, false]);
  now = 3000;
  expect(await readiness.check()).toBe(false);
  expect(calls).toBe(1);
  resolve();
  await gate;
  await Bun.sleep(0);
  now = 6000;
  expect(await readiness.check()).toBe(true);
});

test('readiness reports rejection without exposing the dependency error', async () => {
  const readiness = new Readiness(async () => {
    throw new Error('private details');
  });

  expect(await readiness.check()).toBe(false);
});
