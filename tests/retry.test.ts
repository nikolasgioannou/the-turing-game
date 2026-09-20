import { test, expect } from 'bun:test';
import { retryAfter, retryDelay } from '../src/client/retry';

test('retries are bounded, staggered, and honor server guidance', () => {
  const delays = Array.from({ length: 100 }, (_, i) => retryDelay(4, 0, () => i / 100));

  expect(new Set(delays).size).toBe(100);
  expect(Math.min(...delays)).toBeGreaterThanOrEqual(1000);
  expect(retryDelay(100, 0, () => 1)).toBe(30000);
  expect(retryDelay(0, 60)).toBe(60000);
  expect(retryAfter('60')).toBe(60);
  expect(retryAfter('nonsense')).toBe(0);
});
