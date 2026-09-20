import { expect, test } from 'bun:test';
import { simulatorAuthorized, simulatorKey } from '../src/server/sim/access';

test('production simulator is disabled even with a configured key', () => {
  expect(simulatorKey(true, 'configured')).toBeNull();
  expect(simulatorKey(false, 'configured')).toBe('configured');
});

test('simulator accepts only the credential header, never URL keys', () => {
  expect(
    simulatorAuthorized(new Request('http://localhost/api/sim/events?key=secret'), 'secret'),
  ).toBe(false);

  expect(
    simulatorAuthorized(
      new Request('http://localhost/api/sim/state', { headers: { 'x-sim-key': 'secret' } }),
      'secret',
    ),
  ).toBe(true);

  expect(
    simulatorAuthorized(
      new Request('http://localhost/api/sim/state', { headers: { 'x-sim-key': 'wrong' } }),
      'secret',
    ),
  ).toBe(false);
});
