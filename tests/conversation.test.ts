import { expect, test } from 'bun:test';
import { conversationOpportunity, humanCadence } from '../src/server/conversation';
import type { ChatMessage } from '../src/shared/protocol';

const message = (sender: ChatMessage['sender'], text: string, sentAt = 0): ChatMessage => ({
  id: crypto.randomUUID(),
  sender,
  text,
  sentAt,
});

test('routing distinguishes direct addresses from ordinary mentions', () => {
  expect(
    conversationOpportunity([message('judge', 'B what do you think?')], 'A', undefined, 2000)
      ?.evidence,
  ).toBe('direct');

  expect(
    conversationOpportunity([message('judge', 'A what do you think?')], 'A', undefined, 2000),
  ).toBeNull();

  expect(
    conversationOpportunity([message('judge', 'does vitamin B help')], 'A', undefined, 2000),
  ).toBeNull();

  expect(
    conversationOpportunity(
      [message('judge', 'food?'), message('B', 'pizza'), message('A', 'wont tell you that')],
      'A',
      undefined,
      2000,
    ),
  ).toBeNull();

  expect(
    conversationOpportunity(
      [message('judge', 'food?'), message('B', 'pizza'), message('B', 'wait, pizza?')],
      'A',
      undefined,
      2000,
    ),
  ).toBeNull();
});

test('cadence uses recent human first replies, excluding AI and followups', () => {
  const history = [
    message('judge', 'one', 1000),
    message('B', 'answer', 2000),
    message('A', 'answer', 5000),
    message('A', 'extra', 7000),
    message('judge', 'two', 9000),
    message('A', 'answer', 15000),
  ];

  expect(humanCadence(history, 'A', [4, 5, 6])).toEqual({ responseMs: 6000, charsPerSecond: 5 });
});
