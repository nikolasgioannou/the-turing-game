import { expect, test } from 'bun:test';
import { activeGameLimit } from '../src/server/capacity';

test('active game limit defaults to 20 and requires an explicit positive integer', () => {
  expect(activeGameLimit(undefined)).toBe(20);
  expect(activeGameLimit('35')).toBe(35);

  for (const value of ['', '0', '-1', '2.5', 'abc', 'Infinity', '9007199254740992'])
    expect(() => activeGameLimit(value)).toThrow();
});
