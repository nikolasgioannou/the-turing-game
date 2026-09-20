import { commandSchema } from '../src/shared/commands';
import { afterAll, beforeAll, beforeEach, expect, test, spyOn } from 'bun:test';
import { database } from '../src/server/database';
import { Store } from '../src/server/store';
import { Game, type Peer, type Match } from '../src/server/game';
import { AIError, type AI, type BotHooks, type BotCommand, type BotState } from '../src/server/ai';
import { characters, type Event } from '../src/shared/protocol';

process.env.PGLITE_PATH = 'memory://';

let store: Store, game: Game, clock: number;
const sessions = new Map<string, { hooks: BotHooks; commands: BotCommand[]; stopped: boolean }>();
const ai: AI = {
  model: 'test',
  start(id, _label, hooks) {
    const session = { hooks, commands: [] as BotCommand[], stopped: false };

    sessions.set(id, session);

    return {
      send: (c) => session.commands.push(c),
      stop: () => {
        session.stopped = true;
      },
    };
  },
};

beforeAll(async () => {
  store = new Store(await database());
  await store.init();
});

afterAll(async () => {
  await store.db.close();
});

beforeEach(async () => {
  await store.db.query('TRUNCATE match_outcomes');
  clock = Date.now();
  sessions.clear();
  game = new Game(store, ai, () => clock);
});

async function peer(session: string = crypto.randomUUID()) {
  const events: Event[] = [];
  const p: Peer = { id: crypto.randomUUID(), session, send: (e) => events.push(e) };

  await game.connect(p);

  return { p, events };
}

async function pair(withNames = true) {
  const h = await peer(),
    j = await peer();

  await game.handle(h.p, { type: 'queue', role: 'human' });
  await game.handle(j.p, { type: 'queue', role: 'judge' });

  if (withNames) {
    await game.handle(h.p, { type: 'context', name: 'Nik' });
    await game.handle(j.p, { type: 'context', name: 'Marc' });
  }

  return { h, j, m: game.rooms.get(h.p.roomId!)! };
}

async function question() {
  const p = await pair();

  await game.handle(p.j.p, { type: 'message', text: 'what is love' });

  return p;
}

async function emit(m: Match, messages: BotState['messages'], phase: BotState['phase'] = 'live') {
  sessions.get(m.id)!.hooks.state({
    type: 'state',
    phase,
    messages,
    startedAt: clock / 1000,
    endsAt: clock / 1000 + 90,
  });

  await game.run(async () => {});
}

async function opening() {
  const p = await question();

  await game.handle(p.h.p, { type: 'message', text: 'care' });

  await emit(p.m, [
    { id: 'human', from: p.m.humanLabel, text: 'care', ts: clock / 1000 },
    { id: 'bot', from: p.m.humanLabel === 'A' ? 'B' : 'A', text: 'trust', ts: clock / 1000 },
  ]);

  return p;
}

test('opening answer remains private until the worker reveals it; clock comes from worker', async () => {
  const { h, j, m } = await question();

  await game.handle(h.p, { type: 'message', text: 'secret opening' });
  expect(game.view(m, j.p).messages).toHaveLength(1);
  expect(JSON.stringify(game.view(m, j.p))).not.toContain('secret opening');
  expect(game.view(m, h.p).ownOpening).toBe('secret opening');

  expect(sessions.get(m.id)!.commands.at(-1)).toEqual({
    type: 'message',
    role: 'player',
    text: 'secret opening',
  });

  await emit(m, [
    { id: 'human', from: m.humanLabel, text: 'secret opening', ts: clock / 1000 },
    { id: 'ai', from: m.humanLabel === 'A' ? 'B' : 'A', text: 'something else', ts: clock / 1000 },
  ]);

  expect(m.messages).toHaveLength(3);
  expect(m.phase).toBe('chat');
  expect(m.deadline).toBe(clock + 90000);
});

test('bot can start before the human sends; subsequent human reply is public', async () => {
  const { h, m } = await question();

  await emit(m, [
    { id: 'ai', from: m.humanLabel === 'A' ? 'B' : 'A', text: 'trust', ts: clock / 1000 },
  ]);

  expect(m.phase).toBe('chat');
  expect(m.messages).toHaveLength(2);
  await game.handle(h.p, { type: 'message', text: 'care' });
  expect(m.messages.at(-1)?.text).toBe('care');
});

test('drafts in opening and live chat go only to worker, including deletion', async () => {
  const { h, j, m } = await question();
  const spectator = await peer();

  await expect(game.handle(j.p, { type: 'draft', text: 'secret' })).rejects.toThrow();
  await expect(game.handle(spectator.p, { type: 'draft', text: 'secret' })).rejects.toThrow();
  await game.handle(h.p, { type: 'draft', text: 'private draft' });
  expect(sessions.get(m.id)!.commands.at(-1)).toEqual({ type: 'draft', text: 'private draft' });
  await game.persist(m);

  expect(JSON.stringify(await store.db.query('SELECT * FROM match_outcomes'))).not.toContain(
    'private draft',
  );

  expect(JSON.stringify(j.events)).not.toContain('private draft');
  await game.handle(h.p, { type: 'draft', text: '' });
  expect(sessions.get(m.id)!.commands.at(-1)).toEqual({ type: 'draft', text: '' });
});

test('worker snapshots cannot duplicate replies or replay human messages', async () => {
  const { m } = await opening();
  const messages: BotState['messages'] = [
    { id: 'bot', from: m.humanLabel === 'A' ? 'B' : 'A', text: 'trust', ts: clock / 1000 },
  ];

  await emit(m, messages);
  await emit(m, messages);
  expect(m.messages.filter((x) => x.text === 'trust')).toHaveLength(1);
});

test('messages continue while worker plans; no extra custom scheduler', async () => {
  const { h, j, m } = await opening();

  await game.handle(j.p, { type: 'message', text: 'why' });
  await game.handle(h.p, { type: 'message', text: 'why not' });

  expect(sessions.get(m.id)!.commands.slice(-2)).toEqual([
    { type: 'message', role: 'judge', text: 'why' },
    { type: 'message', role: 'player', text: 'why not' },
  ]);

  const count = sessions.get(m.id)!.commands.length;

  await game.tick();
  expect(sessions.get(m.id)!.commands).toHaveLength(count);
});

test('deadline stops worker and rejects late replies, sending and spectator guesses', async () => {
  const { h, j, m } = await opening();
  const spectator = await peer();

  clock = m.deadline!;
  await game.tick();
  expect(m.phase).toBe('verdict');
  expect(sessions.get(m.id)!.stopped).toBe(true);

  await emit(m, [
    { id: 'late', from: m.humanLabel === 'A' ? 'B' : 'A', text: 'late reply', ts: clock / 1000 },
  ]);

  expect(m.messages.some((x) => x.text === 'late reply')).toBe(false);
  await expect(game.handle(h.p, { type: 'message', text: 'late' })).rejects.toThrow();
  await expect(game.handle(spectator.p, { type: 'vote', choice: 'A' })).rejects.toThrow();

  await game.handle(j.p, {
    type: 'verdict',
    choice: m.humanLabel === 'A' ? 'B' : 'A',
    reason: 'found the bot',
  });

  expect(game.view(m, j.p).result?.humanWon).toBe(true);
});

test('early verdict commits reason and identity together, cancels work and blocks late requests', async () => {
  const { j, m } = await opening();
  const hooks = sessions.get(m.id)!.hooks;

  await hooks.beforeRequest();

  await game.handle(j.p, {
    type: 'verdict',
    choice: m.humanLabel,
    reason: 'guess',
  });

  expect(m.phase).toBe('complete');
  expect(game.view(m, j.p).result?.humanWon).toBe(false);
  expect(sessions.get(m.id)!.stopped).toBe(true);
  await expect(hooks.beforeRequest()).rejects.toThrow('match_closed');
});

test('refresh preserves worker, seat, private opening and deadline', async () => {
  const { h, j, m } = await question();

  await game.handle(h.p, { type: 'message', text: 'private' });

  const worker = sessions.get(m.id);
  const deadline = m.deadline;

  await game.disconnect(h.p);

  const replacement = await peer(h.p.session);

  expect(replacement.p.roomId).toBe(m.id);
  expect(game.view(m, replacement.p).ownOpening).toBe('private');
  expect(game.view(m, j.p).ownOpening).toBeNull();
  expect(m.deadline).toBe(deadline);
  expect(sessions.get(m.id)).toBe(worker);
  expect(worker!.stopped).toBe(false);
});

test('invite tokens reserve seats; watchers cannot impersonate participants', async () => {
  const h = await peer(),
    j = await peer();

  await game.handle(h.p, { type: 'create', role: 'human' });

  const m = game.rooms.get(h.p.roomId!)!;

  await expect(game.handle(j.p, { type: 'watch', id: m.id })).rejects.toThrow();
  expect(game.role(m, j.p)).toBeNull();
  expect(() => game.view(m, j.p)).toThrow('Only participants');
  await expect(game.handle(j.p, { type: 'message', text: 'hello' })).rejects.toThrow();
  await game.handle(j.p, { type: 'join', token: m.inviteToken });
  expect(game.role(m, j.p)).toBe('judge');

  const tab = await peer(h.p.session);

  await expect(game.handle(tab.p, { type: 'queue', role: 'judge' })).rejects.toThrow();
});

test('explicit leave and action timeout stop the worker without awarding a win', async () => {
  const { h, m } = await question();

  await game.handle(h.p, { type: 'leave' });
  expect(m.phase).toBe('abandoned');
  expect(sessions.get(m.id)!.stopped).toBe(true);
  expect(game.view(m, { id: 'test', session: m.humanSession!, send: () => {} }).result).toBeNull();

  const other = await question();

  clock = other.m.deadline!;
  await game.tick();
  expect(other.m.phase).toBe('abandoned');
});

test('provider credentials failure closes match rather than awarding a win', async () => {
  const { m } = await question();

  sessions.get(m.id)!.hooks.failed(new Error('credentials'));
  await game.run(async () => {});
  expect(m.phase).toBe('failed');
  expect(game.view(m, { id: 'test', session: m.humanSession!, send: () => {} }).result).toBeNull();
});

test('judge identifies the bot and both humans win', async () => {
  const { j, m } = await opening();

  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel === 'A' ? 'B' : 'A', reason: '' });

  expect(
    game.view(m, { id: 'test', session: m.humanSession!, send: () => {} }).result?.humanWon,
  ).toBe(true);
});

test('Unicode limits and draft bounds apply at the public boundary', () => {
  expect(characters('👨‍👩‍👧‍👦')).toBe(1);
  expect(commandSchema.safeParse({ type: 'draft', text: 'a'.repeat(501) }).success).toBe(false);
});

test('opening submission racing an early attack is retained until the worker publishes it', async () => {
  const { h, m } = await question();

  await game.handle(h.p, { type: 'message', text: 'in flight' });

  const aiMessage = {
    id: 'early',
    from: m.humanLabel === 'A' ? ('B' as const) : ('A' as const),
    text: 'first',
    ts: clock / 1000,
  };

  await emit(m, [aiMessage]);
  expect(m.openingHuman).toBe('in flight');

  await emit(m, [
    aiMessage,
    { id: 'held', from: m.humanLabel, text: 'in flight', ts: clock / 1000 + 0.1 },
  ]);

  expect(m.openingHuman).toBeNull();
  expect(m.messages.filter((x) => x.text === 'in flight')).toHaveLength(1);
});

test('homepage score stores only immutable outcomes', async () => {
  expect(await store.score()).toEqual({ completed: 0, aiWins: 0 });
  await store.saveOutcome('one', true);
  await store.saveOutcome('two', false);
  await store.saveOutcome('one', false);
  expect(await store.score()).toEqual({ completed: 2, aiWins: 1 });

  expect(await store.db.query('SELECT * FROM match_outcomes ORDER BY id')).toEqual([
    { id: 'one', ai_won: true },
    { id: 'two', ai_won: false },
  ]);
});

test('verdict broadcasts the updated aggregate to people on the homepage', async () => {
  const visitor = await peer();
  const { j, m } = await opening();
  const lastScore = () =>
    visitor.events.filter((event) => event.type === 'lobby').at(-1)?.data.score;

  expect(lastScore()).toEqual({ completed: 0, aiWins: 0 });
  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel === 'A' ? 'B' : 'A', reason: '' });
  expect(lastScore()).toEqual({ completed: 1, aiWins: 0 });
  await game.tick();
  expect(lastScore()).toEqual({ completed: 1, aiWins: 0 });
});

test('opening allows both players to continue and preserves worker publication order', async () => {
  const { h, j, m } = await question();

  await game.handle(h.p, { type: 'message', text: 'first' });
  await game.handle(j.p, { type: 'message', text: 'anything else' });
  await game.handle(h.p, { type: 'message', text: 'second' });
  expect(m.openingHuman).toBe('second');
  expect(m.messages.map((x) => x.text)).toEqual(['what is love', 'anything else']);

  const first = { id: 'first', from: m.humanLabel, text: 'first', ts: clock / 1000 };

  await emit(m, [first], 'opening');
  expect(m.messages.at(-1)?.text).toBe('first');

  const rest: BotState['messages'] = [
    first,
    { id: 'second', from: m.humanLabel, text: 'second', ts: clock / 1000 },
    { id: 'answer', from: m.humanLabel === 'A' ? 'B' : 'A', text: 'answer', ts: clock / 1000 },
  ];

  await emit(m, rest);
  await emit(m, rest);

  expect(m.messages.map((x) => x.text)).toEqual([
    'what is love',
    'anything else',
    'first',
    'second',
    'answer',
  ]);

  expect(m.openingHuman).toBeNull();
});

test('name and device context stays role-scoped, and pre-question drafts are ignored', async () => {
  const { h, j, m } = await pair(false);

  await game.handle(h.p, { type: 'draft', text: 'too early' });
  expect(sessions.has(m.id)).toBe(false);

  const hints = {
    mobile: 'true',
    platform: 'iPhone',
    tz: 'America/New_York',
    day: 'Monday',
    localTime: '1:00 PM',
  };

  await game.handle(h.p, { type: 'context', name: 'PrivateName', hints });
  await expect(game.handle(j.p, { type: 'message', text: 'hi' })).rejects.toThrow('names');
  await game.handle(j.p, { type: 'context', name: 'Marc', hints });

  expect(sessions.has(m.id)).toBe(false);
  await game.handle(j.p, { type: 'message', text: 'hello' });

  expect(sessions.get(m.id)!.commands).toEqual([
    { type: 'context', role: 'judge', name: 'Marc' },
    { type: 'context', role: 'player', name: 'PrivateName', hints },
    { type: 'message', role: 'judge', text: 'hello' },
  ]);

  expect(JSON.stringify(game.view(m, j.p))).not.toContain('PrivateName');

  expect(JSON.stringify(await store.db.query('SELECT * FROM match_outcomes'))).not.toContain(
    'iPhone',
  );

  expect(game.view(m, h.p).judgeName).toBe('Marc');

  const watcher = await peer();

  await expect(game.handle(watcher.p, { type: 'watch', id: m.id })).rejects.toThrow();
  await expect(game.handle(watcher.p, { type: 'context', name: 'spoof' })).rejects.toThrow();
});

test('context cannot create workers in waiting or verdict, or bypass name entry', async () => {
  const { h, j, m } = await pair(false);

  await expect(game.handle(j.p, { type: 'message', text: 'bypass' })).rejects.toThrow('names');
  await expect(game.handle(h.p, { type: 'context', name: '😀' })).rejects.toThrow('first name');
  expect(sessions.has(m.id)).toBe(false);
  await game.handle(h.p, { type: 'context', name: 'Nik' });
  await game.handle(j.p, { type: 'context', name: 'Marc' });
  await game.handle(j.p, { type: 'message', text: 'hi' });
  await emit(m, []);
  await game.expire(m);

  const worker = sessions.get(m.id)!;

  await expect(game.handle(h.p, { type: 'context', name: 'Nik' })).rejects.toThrow();
  expect(sessions.get(m.id)).toBe(worker);
  expect(worker.stopped).toBe(true);
});

test('rapid opening submissions obey the limit before worker snapshots arrive', async () => {
  const { h, m } = await question();
  const deadline = m.deadline;

  for (let n = 0; n < 30; n++) await game.handle(h.p, { type: 'message', text: String(n) });

  await expect(game.handle(h.p, { type: 'message', text: '31st' })).rejects.toThrow(
    'message limit',
  );

  expect(m.deadline).toBe(deadline);
  expect(m.humanMessageCount).toBe(30);
});

test('a stale opening snapshot cannot clear a newer pending answer or drop later chat', async () => {
  const { h, m } = await question();

  await game.handle(h.p, { type: 'message', text: 'first' });
  await game.handle(h.p, { type: 'message', text: 'second' });

  const first = { id: 'first', from: m.humanLabel, text: 'first', ts: clock / 1000 };
  const ai = {
    id: 'ai',
    from: (m.humanLabel === 'A' ? 'B' : 'A') as 'A' | 'B',
    text: 'ai answer',
    ts: clock / 1000,
  };

  await emit(m, [first, ai]);
  expect(m.openingHuman).toBe('second');
  await game.handle(h.p, { type: 'message', text: 'third' });

  await emit(m, [
    first,
    ai,
    { id: 'second', from: m.humanLabel, text: 'second', ts: clock / 1000 },
    { id: 'third', from: m.humanLabel, text: 'third', ts: clock / 1000 },
  ]);

  expect(m.messages.filter((x) => x.sender === m.humanLabel).map((x) => x.text)).toEqual([
    'first',
    'second',
    'third',
  ]);

  expect(m.openingHuman).toBeNull();
});

test('unchanged lobby ticks reuse the aggregate until a result is saved', async () => {
  const original = store.score.bind(store);
  let calls = 0;

  store.score = async () => {
    calls++;

    return original();
  };

  try {
    await game.lobby();
    await game.tick();
    await game.tick();
    expect(calls).toBe(1);

    const { j, m } = await opening();

    expect(calls).toBe(1);

    await game.handle(j.p, {
      type: 'verdict',
      choice: m.humanLabel === 'A' ? 'B' : 'A',
      reason: '',
    });

    expect(calls).toBe(2);
  } finally {
    store.score = original;
  }
});

test('unseated sessions cannot discover or access matches', async () => {
  const { m } = await question();
  const outsider = await peer();

  expect(outsider.events.some((event) => event.type === 'room')).toBe(false);
  expect(outsider.events.find((event) => event.type === 'lobby')?.data).not.toHaveProperty('rooms');
  expect(commandSchema.safeParse({ type: 'watch', id: m.id }).success).toBe(false);
  expect(commandSchema.safeParse({ type: 'vote', choice: 'A' }).success).toBe(false);

  outsider.p.roomId = m.id;
  expect(() => game.view(m, outsider.p)).toThrow('Only participants');
  game.broadcast(m);
  expect(outsider.events.some((event) => event.type === 'room')).toBe(false);
  await expect(game.handle(outsider.p, { type: 'message', text: 'intruder' })).rejects.toThrow();
});

test('completed matches store only an outcome and are not rejoined after returning home', async () => {
  const { h, j, m } = await opening();

  await game.handle(j.p, {
    type: 'verdict',
    choice: m.humanLabel === 'A' ? 'B' : 'A',
    reason: 'private explanation',
  });

  expect(await store.db.query('SELECT * FROM match_outcomes')).toEqual([
    { id: m.id, ai_won: false },
  ]);

  expect(
    (
      await store.db.query<{ name: string | null }>("SELECT to_regclass('public.matches') AS name")
    )[0].name,
  ).toBeNull();

  await game.handle(h.p, { type: 'home' });
  await game.handle(j.p, { type: 'home' });
  await game.tick();
  expect(game.rooms.has(m.id)).toBe(false);

  const refreshed = await peer(h.p.session);

  expect(refreshed.events.some((event) => event.type === 'room')).toBe(false);
});

for (const first of ['human', 'judge', 'either'] as const) {
  for (const second of ['human', 'judge', 'either'] as const) {
    test(`matchmaking respects preferences: ${first} then ${second}`, async () => {
      const a = await peer();
      const b = await peer();

      await game.handle(a.p, { type: 'queue', role: first });
      expect(a.events.filter((e) => e.type === 'lobby').at(-1)?.data.queued).toBe(first);
      await game.handle(b.p, { type: 'queue', role: second });

      if (first === second && first !== 'either') {
        expect(game.rooms.size).toBe(0);
        expect(a.p.queue).toBe(first);
        expect(b.p.queue).toBe(second);

        return;
      }

      expect(game.rooms.size).toBe(1);
      expect(a.p.roomId).toBe(b.p.roomId);

      const m = game.rooms.get(a.p.roomId!)!;
      const aRole = game.role(m, a.p);
      const bRole = game.role(m, b.p);

      expect(new Set([aRole, bRole])).toEqual(new Set(['human', 'judge']));

      if (first !== 'either') expect(aRole).toBe(first);

      if (second !== 'either') expect(bRole).toBe(second);

      expect(a.p.queue).toBeUndefined();
      expect(b.p.queue).toBeUndefined();
      expect(m.phase).toBe('ready');
    });
  }
}

test('either-role queue can be canceled and cannot match another socket from the same session', async () => {
  const a = await peer();
  const duplicate = await peer(a.p.session);

  await game.handle(a.p, { type: 'queue', role: 'either' });

  await expect(game.handle(duplicate.p, { type: 'queue', role: 'either' })).rejects.toThrow(
    'active',
  );

  await game.handle(a.p, { type: 'cancel' });

  const b = await peer();

  await game.handle(b.p, { type: 'queue', role: 'judge' });
  expect(game.rooms.size).toBe(0);
  await game.handle(a.p, { type: 'queue', role: 'either' });
  expect(game.role(game.rooms.get(a.p.roomId!)!, a.p)).toBe('human');
  expect(commandSchema.safeParse({ type: 'create', role: 'either' }).success).toBe(true);
});

for (const [randomValue, expectedRole] of [
  [0.25, 'human'],
  [0.75, 'judge'],
] as const) {
  test(`either-role invitation assigns host ${expectedRole} and reserves the opposite seat`, async () => {
    const host = await peer();
    const friend = await peer();
    const random = spyOn(Math, 'random').mockReturnValue(randomValue);

    try {
      await game.handle(host.p, { type: 'create', role: 'either' });

      const match = game.rooms.get(host.p.roomId!)!;

      expect(game.role(match, host.p)).toBe(expectedRole);
      expect(game.view(match, host.p).openRole).toBe(expectedRole === 'human' ? 'judge' : 'human');
      expect(host.p.queue).toBeUndefined();
      expect(match.phase).toBe('waiting');
      await game.handle(friend.p, { type: 'join', token: match.inviteToken });
      expect(game.role(match, friend.p)).toBe(expectedRole === 'human' ? 'judge' : 'human');
      expect(match.phase).toBe('ready');
      expect(game.role(match, host.p)).toBe(expectedRole);
    } finally {
      random.mockRestore();
    }
  });
}

async function finishedFriends() {
  const h = await peer(),
    j = await peer();

  await game.handle(h.p, { type: 'create', role: 'human' });

  const m = game.rooms.get(h.p.roomId!)!;

  await game.handle(j.p, { type: 'join', token: m.inviteToken });
  m.choice = m.humanLabel === 'A' ? 'B' : 'A';
  await game.finish(m, 'complete', null);

  return { h, j, m };
}

for (const humanChoice of ['human', 'judge', 'either'] as const) {
  for (const judgeChoice of ['human', 'judge', 'either'] as const) {
    test(`friend rematch preferences: ${humanChoice} / ${judgeChoice}`, async () => {
      const { h, j, m } = await finishedFriends();

      await game.handle(h.p, { type: 'rematch', role: humanChoice });
      expect(game.rooms.size).toBe(1);
      expect(game.view(m, j.p).rematch?.other).toBe(humanChoice);
      await game.handle(j.p, { type: 'rematch', role: judgeChoice });

      const conflict = humanChoice !== 'either' && humanChoice === judgeChoice;

      if (conflict) {
        expect(h.p.roomId).toBe(m.id);
        expect(game.rooms.size).toBe(1);
        await game.handle(j.p, { type: 'rematch', role: 'either' });
      }

      const next = game.rooms.get(h.p.roomId!)!;

      expect(next.id).not.toBe(m.id);
      expect(j.p.roomId).toBe(next.id);
      expect(next.phase).toBe('ready');
      expect(game.view(next, h.p).matchKind).toBe('friend');
      expect(next.messages).toEqual([]);
      expect(next.choice).toBeNull();
      expect(game.role(next, h.p)).not.toBe(game.role(next, j.p));

      if (humanChoice !== 'either') expect(game.role(next, h.p)).toBe(humanChoice);

      if (judgeChoice !== 'either' && !conflict) expect(game.role(next, j.p)).toBe(judgeChoice);

      expect((await store.score()).completed).toBe(1);
      await expect(game.handle(h.p, { type: 'rematch', role: 'either' })).rejects.toThrow();
    });
  }
}

test('friend rematch cancellation withdraws consent', async () => {
  const { h, j, m } = await finishedFriends();

  await game.handle(h.p, { type: 'rematch', role: 'human' });
  await game.handle(h.p, { type: 'rematch', role: null });
  await game.handle(j.p, { type: 'rematch', role: 'judge' });
  expect(game.rooms.size).toBe(1);
  expect(game.view(m, j.p).rematch?.other).toBeNull();
});

test('friend leaving invalidates a rematch offer', async () => {
  const { h, j, m } = await finishedFriends();

  await game.handle(h.p, { type: 'rematch', role: 'human' });
  await game.handle(h.p, { type: 'home' });
  expect(game.view(m, j.p).rematch).toEqual({ own: null, other: null, available: false });
  await expect(game.handle(j.p, { type: 'rematch', role: 'judge' })).rejects.toThrow('left');
  expect(game.rooms.size).toBe(1);
});

test('rematches reject outsiders and public matches', async () => {
  const { h, m } = await finishedFriends();
  const outsider = await peer();

  outsider.p.roomId = m.id;
  await expect(game.handle(outsider.p, { type: 'rematch', role: 'human' })).rejects.toThrow();
  m.inviteToken = undefined;
  await expect(game.handle(h.p, { type: 'rematch', role: 'human' })).rejects.toThrow();
});

test('disconnection withdraws friend rematch consent', async () => {
  const { h, j, m } = await finishedFriends();

  await game.handle(h.p, { type: 'rematch', role: 'either' });
  await game.disconnect(h.p);
  expect(game.view(m, j.p).rematch).toEqual({ own: null, other: null, available: false });
  await expect(game.handle(j.p, { type: 'rematch', role: 'judge' })).rejects.toThrow('left');
});

test('provider failures do not pause future match creation', async () => {
  for (const code of ['openrouter_402', 'openrouter_503', 'openrouter_503', 'openrouter_503']) {
    const { m } = await question();

    sessions.get(m.id)!.hooks.failed(new AIError(code));
    await game.run(async () => {});
    expect(m.phase).toBe('failed');
  }

  const p = await peer();

  await game.handle(p.p, { type: 'create', role: 'judge' });
  expect(p.p.roomId).toBeDefined();
});

test('store initializes only match outcome storage', async () => {
  const rows = await store.db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );

  expect(rows.map((r) => r.tablename).sort()).toEqual(['match_outcomes']);
});

test('match creation has no daily token or hourly match quota', async () => {
  for (let i = 0; i < 40; i++) {
    const p = await peer();

    await game.handle(p.p, { type: 'create', role: 'judge' });
    expect(p.p.roomId).toBeDefined();
    await game.handle(p.p, { type: 'leave' });
  }

  expect(game.rooms.size).toBe(40);
});

test('provider exhaustion ends active games without outcomes, clears queues, and recovers', async () => {
  const first = await opening();
  const second = await opening();
  const waiting = await peer();

  await game.handle(waiting.p, { type: 'queue', role: 'human' });

  let exhausted = false;

  ai.capacityExhausted = () => exhausted;

  ai.reportCreditExhausted = () => {
    exhausted = true;
  };

  ai.unavailable = () => (exhausted ? 'AI games are temporarily unavailable.' : null);

  try {
    sessions.get(first.m.id)!.hooks.failed(new AIError('openrouter_402'));
    await game.run(async () => {});
    await game.tick();

    for (const m of [first.m, second.m]) {
      expect(m.phase).toBe('failed');
      expect(m.message).toContain('won’t count');
      expect(sessions.get(m.id)!.stopped).toBe(true);
      expect(game.view(m, m.id === first.m.id ? first.j.p : second.j.p).result).toBeNull();
    }

    expect(waiting.p.queue).toBeUndefined();
    expect(await store.score()).toEqual({ completed: 0, aiWins: 0 });

    const newcomer = await peer();

    await expect(game.handle(newcomer.p, { type: 'create', role: 'judge' })).rejects.toThrow(
      'temporarily unavailable',
    );

    exhausted = false;
    await game.handle(newcomer.p, { type: 'create', role: 'judge' });
    expect(newcomer.p.roomId).toBeDefined();
  } finally {
    delete ai.capacityExhausted;
    delete ai.reportCreditExhausted;
    delete ai.unavailable;
  }
});

test('credit exhaustion does not discard a game already ready for a verdict', async () => {
  const { m, j } = await opening();

  await game.expire(m);
  ai.capacityExhausted = () => true;

  try {
    await game.tick();
    expect(m.phase).toBe('verdict');

    await game.handle(j.p, {
      type: 'verdict',
      choice: m.humanLabel === 'A' ? 'B' : 'A',
      reason: '',
    });

    expect(m.phase).toBe('complete');
    expect((await store.score()).completed).toBe(1);
  } finally {
    delete ai.capacityExhausted;
  }
});

test('default capacity stops room 21, including simultaneous simulator admissions', async () => {
  const attempts = await Promise.allSettled(Array.from({ length: 25 }, () => game.newMatch(true)));

  expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(20);
  expect(game.rooms.size).toBe(20);
  expect(game.atCapacity()).toBe(true);
});

test('queued players are matched in arrival order when a slot opens', async () => {
  game = new Game(store, ai, () => clock, 1);

  const occupied = await pair(false);
  const a = await peer(),
    b = await peer(),
    c = await peer();

  await game.handle(a.p, { type: 'queue', role: 'human' });
  await game.handle(b.p, { type: 'queue', role: 'human' });
  await game.handle(c.p, { type: 'queue', role: 'judge' });
  expect(a.p.roomId).toBeUndefined();
  await game.handle(occupied.h.p, { type: 'leave' });
  await game.tick();
  expect(a.p.roomId).toBeDefined();
  expect(a.p.roomId).toBe(c.p.roomId);
  expect(b.p.queue).toBe('human');
  expect([...game.rooms.values()].filter((m) => m.phase === 'ready')).toHaveLength(1);
});

test('cancel and disconnect remove waiting players; expired invitations free capacity', async () => {
  game = new Game(store, ai, () => clock, 1);

  const host = await peer();

  await game.handle(host.p, { type: 'create', role: 'human' });

  const a = await peer(),
    b = await peer(),
    c = await peer(),
    d = await peer();

  for (const p of [a, b, c, d]) await game.handle(p.p, { type: 'queue', role: 'either' });

  await game.handle(a.p, { type: 'cancel' });
  await game.disconnect(b.p);
  clock += 90_001;
  await game.tick();
  expect(a.p.roomId).toBeUndefined();
  expect(b.p.roomId).toBeUndefined();
  expect(c.p.roomId).toBeDefined();
  expect(c.p.roomId).toBe(d.p.roomId);
});

test('friend joins use their reserved slot and full rematches can retry after release', async () => {
  game = new Game(store, ai, () => clock, 1);

  const { h, j, m } = await finishedFriends();
  const host = await peer(),
    guest = await peer();

  await game.handle(host.p, { type: 'create', role: 'human' });

  const reserved = game.rooms.get(host.p.roomId!)!;

  await game.handle(guest.p, { type: 'join', token: reserved.inviteToken });

  const extra = await peer();

  await expect(game.handle(extra.p, { type: 'create', role: 'judge' })).rejects.toThrow(
    'All game slots',
  );

  await game.handle(h.p, { type: 'rematch', role: 'human' });

  await expect(game.handle(j.p, { type: 'rematch', role: 'judge' })).rejects.toThrow(
    'All game slots',
  );

  expect(m.rematch).toEqual({});
  await game.handle(host.p, { type: 'leave' });
  await game.handle(h.p, { type: 'rematch', role: 'human' });
  await game.handle(j.p, { type: 'rematch', role: 'judge' });
  expect(h.p.roomId).not.toBe(m.id);
  expect(h.p.roomId).toBe(j.p.roomId);
});

test('rapid invitation reuse is throttled but normal replay recovers', async () => {
  const { p } = await peer();

  for (let i = 0; i < 6; i++) {
    await game.handle(p, { type: 'create', role: 'human' });
    await game.handle(p, { type: 'leave' });
  }

  await expect(game.handle(p, { type: 'create', role: 'human' })).rejects.toThrow(
    'starting games too quickly',
  );

  clock += 90_000;
  await game.handle(p, { type: 'create', role: 'human' });
  expect(game.rooms.get(p.roomId!)?.phase).toBe('waiting');
});

test('abusive queued session cannot eject an unrelated waiting player', async () => {
  const a = await peer();

  for (let i = 0; i < 6; i++) {
    await game.handle(a.p, { type: 'create', role: 'human' });
    await game.handle(a.p, { type: 'leave' });
  }

  const normal = await peer();

  await game.handle(normal.p, { type: 'queue', role: 'judge' });
  await game.handle(a.p, { type: 'queue', role: 'human' });
  expect(a.p.queue).toBeUndefined();
  expect(normal.p.queue).toBe('judge');

  const good = await peer();

  await game.handle(good.p, { type: 'queue', role: 'human' });
  expect(good.p.roomId).toBe(normal.p.roomId);
});

test('verdict write retries keep identities private and preserve the choice and reason', async () => {
  const { j, h, m } = await opening();
  const original = store.saveOutcome.bind(store);
  let attempts = 0;

  store.saveOutcome = async (...args) => {
    if (++attempts === 1) throw Error('temporary database failure');

    await original(...args);
  };

  try {
    const completion = game.handle(j.p, {
      type: 'verdict',
      choice: m.humanLabel,
      reason: 'my exact reason',
    });

    await Bun.sleep(10);
    expect(m.phase).toBe('saving');
    expect(game.view(m, h.p).result).toBeNull();

    await expect(
      game.handle(j.p, {
        type: 'verdict',
        choice: m.humanLabel === 'A' ? 'B' : 'A',
        reason: 'changed',
      }),
    ).rejects.toThrow();

    await completion;
    expect(m.phase).toBe('complete');
    expect(m.reason).toBe('my exact reason');
    expect((await store.score()).completed).toBe(1);
    expect(attempts).toBe(2);
  } finally {
    store.saveOutcome = original;
  }
});

test('ambiguous outcome write retries are idempotent and permanent failure is actionable', async () => {
  const { j, m } = await opening();
  const original = store.saveOutcome.bind(store);
  let attempts = 0;

  store.saveOutcome = async (...args) => {
    await original(...args);

    if (++attempts === 1) throw Error('ack lost');
  };

  try {
    await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: 'saved once' });
    expect((await store.score()).completed).toBe(1);
    expect(m.phase).toBe('complete');
  } finally {
    store.saveOutcome = original;
  }

  const next = await opening();

  store.saveOutcome = async () => {
    throw Error('database down');
  };

  try {
    await game.handle(next.j.p, { type: 'verdict', choice: next.m.humanLabel, reason: 'retained' });
    expect(next.m.phase).toBe('failed');
    expect(next.m.reason).toBe('retained');
    expect(game.view(next.m, next.j.p).result).toBeNull();
    expect(next.m.message).toContain('couldn’t confirm');
  } finally {
    store.saveOutcome = original;
  }
});

test('disconnect while saving preserves the committed result', async () => {
  const { j, m } = await opening();
  const original = store.saveOutcome.bind(store);
  let release!: () => void;

  store.saveOutcome = async (...args) => {
    await new Promise<void>((resolve) => (release = resolve));
    await original(...args);
  };

  try {
    const completion = game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: 'yes' });

    await Bun.sleep(1);
    await game.disconnect(j.p);
    release();
    await completion;
    expect(m.phase).toBe('complete');
    expect((await store.score()).completed).toBe(1);
  } finally {
    store.saveOutcome = original;
  }
});

test('reconnect handshake distinguishes restored seats from missing or foreign matches', async () => {
  const { h, m } = await opening();

  await game.disconnect(h.p);

  const events: Event[] = [];
  const restored: Peer = {
    id: crypto.randomUUID(),
    session: h.p.session,
    resumeRoom: m.id,
    send: (e) => events.push(e),
  };

  await game.connect(restored);
  expect(events[0]).toEqual({ type: 'session', roomId: m.id });
  expect(restored.roomId).toBe(m.id);

  const foreign: Peer = {
    id: crypto.randomUUID(),
    session: crypto.randomUUID(),
    resumeRoom: m.id,
    send: (e) => events.push(e),
  };

  events.length = 0;
  await game.connect(foreign);
  expect(events[0]).toEqual({ type: 'session', roomId: null });

  const fresh = new Game(store, ai, () => clock);

  events.length = 0;
  await fresh.connect({ ...restored, id: crypto.randomUUID(), roomId: undefined });
  expect(events[0]).toEqual({ type: 'session', roomId: null });
});

test('friend result reconnect restores rematch availability without restoring withdrawn consent', async () => {
  const { h, j, m } = await finishedFriends();

  await game.handle(h.p, { type: 'rematch', role: 'human' });
  await game.disconnect(h.p);

  const reconnect: Peer = {
    id: crypto.randomUUID(),
    session: h.p.session,
    resumeRoom: m.id,
    send: () => {},
  };

  await game.connect(reconnect);
  expect(reconnect.roomId).toBe(m.id);
  expect(game.view(m, reconnect).rematch?.own).toBeNull();
  expect(game.view(m, j.p).rematch?.available).toBe(true);
});
