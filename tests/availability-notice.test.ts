import { expect, test } from 'bun:test';
import {
  availabilityNoticeReducer as reduce,
  initialAvailabilityNotice,
} from '../src/client/availability-notice';
import type { Lobby } from '../src/shared/protocol';

const lobby = (available: boolean, queued: Lobby['queued'] = null): Lobby => ({
  score: { completed: 0, aiWins: 0 },
  availability: { available, message: available ? null : 'Unavailable' },
  queued,
});

test('queue interruption is remembered until recovery without automatically requeueing', () => {
  let s = reduce(initialAvailabilityNotice, { type: 'lobby', lobby: lobby(true, 'human') });

  s = reduce(s, { type: 'lobby', lobby: lobby(false) });
  expect(s.paused).toBe(true);
  s = reduce(s, { type: 'lobby', lobby: lobby(false) });
  expect(s.paused).toBe(true);
  s = reduce(s, { type: 'lobby', lobby: lobby(true) });
  expect(s).toMatchObject({ paused: false, recovered: true, queued: false });
});

test('recovery notices do not appear on initial connection or reappear after dismissal', () => {
  let s = reduce(initialAvailabilityNotice, { type: 'lobby', lobby: lobby(true) });

  expect(s.recovered).toBe(false);
  s = reduce(s, { type: 'lobby', lobby: lobby(false) });
  s = reduce(s, { type: 'lobby', lobby: lobby(true) });
  expect(s.recovered).toBe(true);
  s = reduce(s, { type: 'dismiss' });
  s = reduce(s, { type: 'lobby', lobby: lobby(true) });
  expect(s.recovered).toBe(false);
  s = reduce(s, { type: 'lobby', lobby: lobby(false) });
  s = reduce(s, { type: 'lobby', lobby: lobby(true) });
  expect(s.recovered).toBe(true);
});
