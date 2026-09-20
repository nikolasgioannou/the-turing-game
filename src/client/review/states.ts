import type { ReviewState } from '../main';
import type { Lobby, RoomView } from '../../shared/protocol';

const lobby: Lobby = {
  score: { completed: 125, aiWins: 47 },
  availability: { available: true, message: null },
  queued: null,
};

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    id: 'review-room',
    matchKind: 'public',
    rematch: null,
    phase: 'chat',
    role: 'human',
    ownLabel: 'A',
    ownOpening: null,
    ownName: 'Alex',
    judgeName: 'Sam',
    contextReady: true,
    createdAt: 0,
    startedAt: 0,
    deadline: 41,
    openRole: null,
    result: null,
    message: null,
    messages: [
      { id: '1', sender: 'judge', text: 'what is your ideal sunday?', sentAt: 0 },
      { id: '2', sender: 'A', text: 'sleep in then get coffee with a friend', sentAt: 1 },
      { id: '3', sender: 'B', text: 'a long walk and absolutely no plans', sentAt: 2 },
      { id: '4', sender: 'judge', text: 'what did you actually do last sunday?', sentAt: 3 },
    ],
    ...overrides,
  };
}

export type ReviewExample = {
  id: string;
  group: string;
  title: string;
  description: string;
  state: ReviewState;
};

const examples: ReviewExample[] = [];

function add(group: string, id: string, title: string, state: ReviewState, description = title) {
  examples.push({ id, group, title, description, state: { lobby, connected: true, ...state } });
}

add('Lobby', 'loading', 'Loading results', { lobby: null, connected: false });
add('Lobby', 'lobby', 'Live results', {});

add('Lobby', 'empty-score', 'No completed games', {
  lobby: { ...lobby, score: { completed: 0, aiWins: 0 } },
});

add('Lobby', 'offline', 'Connection lost', {
  connected: false,
  error: 'Connection lost. Reconnecting to your match…',
});

const unavailableLobby: Lobby = {
  ...lobby,
  availability: {
    available: false,
    message: 'We’ve reached our game limit. Please come back later.',
  },
};

add('Lobby', 'capacity', 'Game limit reached', { lobby: unavailableLobby });

add('Lobby', 'capacity-reset', 'Capacity with reset time', {
  lobby: {
    ...unavailableLobby,
    availability: {
      ...unavailableLobby.availability,
      message: 'We’ve reached today’s game limit. Come back tomorrow.',
      resetsAt: Date.now() + 3_600_000,
    },
  },
});

add('Lobby', 'availability-check', 'AI connection check failed', {
  lobby: {
    ...lobby,
    availability: {
      available: false,
      message: 'We’re having trouble starting games. Please try again shortly.',
    },
  },
});

add('Start', 'capacity-queue', 'Matchmaking paused', {
  lobby: unavailableLobby,
  availabilityNotice: 'paused',
});

add('Lobby', 'capacity-recovered', 'Games are back', { availabilityNotice: 'recovered' });

add('Replay', 'capacity-recovered-friend', 'AI back: friend rematch', {
  availabilityNotice: 'recovered',
  room: room({
    phase: 'failed',
    matchKind: 'friend',
    rematch: { own: null, other: null, available: true },
    message:
      'We reached our game limit and had to end this round early. It won’t count as a win or loss.',
  }),
});

for (const role of ['judge', 'human'] as const) {
  add('Results', 'capacity-' + role, 'AI interrupted: ' + role, {
    lobby: unavailableLobby,
    room: room({
      role,
      ownLabel: role === 'human' ? 'A' : null,
      phase: 'failed',
      deadline: null,
      message:
        'We reached our game limit and had to end this round early. It won’t count as a win or loss.',
    }),
  });
}

add('Lobby', 'rules', 'How to play', { instructionsOpen: true });
add('Start', 'roles-public', 'Public role selection', { startOpen: true });
add('Start', 'roles-friend', 'Friend role selection', { startOpen: true, inviteRole: true });

for (const role of ['human', 'judge', 'either'] as const) {
  add('Start', 'queue-' + role, 'Finding a match: ' + role, {
    startOpen: true,
    lobby: { ...lobby, queued: role },
  });
}

add('Start', 'invite', 'Waiting for a friend', {
  startOpen: true,
  room: room({
    matchKind: 'friend',
    phase: 'waiting',
    messages: [],
    inviteToken: 'review-invitation-not-a-real-token',
    openRole: 'judge',
  }),
});

for (const role of ['judge', 'human'] as const) {
  const identity = { role, ownLabel: role === 'human' ? ('A' as const) : null };

  add('Match', 'name-' + role, 'Name entry: ' + role, {
    room: room({ ...identity, phase: 'ready', ownName: '', contextReady: false, messages: [] }),
  });

  add('Match', 'ready-' + role, 'Before the first question: ' + role, {
    room: room({ ...identity, phase: 'ready', messages: [] }),
  });

  add('Match', 'opening-' + role, 'Opening question: ' + role, {
    room: room({
      ...identity,
      phase: 'opening',
      messages: [{ id: '1', sender: 'judge', text: 'what is your ideal sunday?', sentAt: 0 }],
    }),
  });

  add('Match', 'preparing-' + role, 'Preparing opening replies: ' + role, {
    room: room({ ...identity, phase: 'opening_ai' }),
  });

  add('Match', 'chat-' + role, 'Live chat: ' + role, { room: room(identity) });

  add('Match', 'verdict-' + role, 'Time up: ' + role, {
    room: room({ ...identity, phase: 'verdict', deadline: 90 }),
  });

  for (const won of [true, false]) {
    add('Results', `result-${role}-${won ? 'win' : 'loss'}`, `${role}: ${won ? 'won' : 'lost'}`, {
      room: room({
        ...identity,
        phase: 'complete',
        deadline: null,
        result: {
          humanLabel: 'A',
          choice: won ? 'B' : 'A',
          humanWon: won,
          reason: 'The replies sounded a little too polished.',
        },
      }),
    });
  }
}

add('Match', 'guess-early', 'Judge guessing early', {
  guessing: true,
  room: room({ role: 'judge', ownLabel: null }),
});

add('Match', 'chat-low-time', 'Final seconds', { room: room({ deadline: 8 }) });
add('Match', 'chat-near-limit', 'Near character limit', { message: 'A'.repeat(465), room: room() });
add('Match', 'chat-over-limit', 'Over character limit', { message: 'A'.repeat(501), room: room() });

add('Match', 'chat-offline', 'Disconnected during chat', {
  room: room(),
  connected: false,
  error: 'Connection lost. Reconnecting to your match…',
});

for (const phase of ['failed', 'abandoned'] as const) {
  add('Results', phase, phase === 'failed' ? 'Technical failure' : 'Opponent left', {
    room: room({
      phase,
      message:
        phase === 'failed'
          ? 'AI is unavailable. This match was not counted.'
          : 'A player left. This match was not counted.',
    }),
  });
}

for (const [id, title, rematch] of [
  ['friend-result', 'Friend replay available', { own: null, other: null, available: true }],
  ['rematch-sent', 'Waiting for rematch consent', { own: 'human', other: null, available: true }],
  ['rematch-received', 'Friend wants a rematch', { own: null, other: 'judge', available: true }],
  ['rematch-conflict', 'Same role selected', { own: 'human', other: 'human', available: true }],
  ['friend-left', 'Friend left after game', { own: null, other: null, available: false }],
] as const) {
  add('Replay', id, title, {
    room: room({
      phase: 'complete',
      matchKind: 'friend',
      rematch,
      result: { humanLabel: 'A', choice: 'B', humanWon: true, reason: '' },
    }),
  });
}

export const reviewExamples = examples;

export function materialize(example: ReviewExample): ReviewState {
  const state = structuredClone(example.state);

  if (state.room?.deadline) state.room.deadline = Date.now() + state.room.deadline * 1000;

  return state;
}

add('Start', 'server-full', 'Waiting for a game slot', {
  startOpen: true,
  lobby: { ...lobby, queued: 'either', atCapacity: true },
});
