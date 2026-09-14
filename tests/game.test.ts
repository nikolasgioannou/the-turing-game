import { commandSchema } from '../src/shared/commands';
import { afterAll, beforeAll, beforeEach, expect, test, describe } from 'bun:test';
import { database } from '../src/server/database';
import {
  Store,
  MATCH_INPUT,
  MATCH_OUTPUT,
  INPUT_PER_REQUEST,
  OUTPUT_PER_REQUEST,
} from '../src/server/store';
import { Game, type Peer, type Match } from '../src/server/game';
import type { AI, BotHooks, BotCommand, BotState } from '../src/server/ai';
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
  await store.db.query('TRUNCATE match_outcomes,ai_requests,reservations,daily_usage');
  await store.db.query('UPDATE service_state SET reason=null,until_at=0');
  store.caps = { input: 1_000_000, output: 100_000 };
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
    choice: m.humanLabel,
    reason: 'found the bot',
  });

  expect(game.view(m, j.p).result?.humanWon).toBe(true);
});

test('early verdict commits reason and identity together, cancels work and settles outstanding usage', async () => {
  const { j, m } = await opening();
  const hooks = sessions.get(m.id)!.hooks;
  const request = await hooks.reserve({ input: 12345, output: 400 });

  await game.handle(j.p, {
    type: 'verdict',
    choice: m.humanLabel === 'A' ? 'B' : 'A',
    reason: 'guess',
  });

  expect(m.phase).toBe('complete');
  expect(game.view(m, j.p).result?.humanWon).toBe(false);
  expect(sessions.get(m.id)!.stopped).toBe(true);
  await hooks.settle(request, { input: 200, output: 20 }, { status: 'ok' });

  const [usage] = await store.db.query<any>('SELECT * FROM daily_usage');

  expect(Number(usage.input_used)).toBe(200);
  expect(Number(usage.input_reserved)).toBe(0);
  await expect(hooks.reserve({ input: 10, output: 10 })).rejects.toThrow();
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

test('judge identifies the human using current scoring', async () => {
  const { j, m } = await opening();

  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: '' });

  expect(
    game.view(m, { id: 'test', session: m.humanSession!, send: () => {} }).result?.humanWon,
  ).toBe(true);
});

test('Unicode limits and draft bounds apply at the public boundary', () => {
  expect(characters('👨‍👩‍👧‍👦')).toBe(1);
  expect(commandSchema.safeParse({ type: 'draft', text: 'a'.repeat(501) }).success).toBe(false);
});

describe('provider-independent usage', () => {
  test('concurrent reservations cannot exceed input or output cap', async () => {
    store.caps = { input: MATCH_INPUT, output: MATCH_OUTPUT };

    const results = await Promise.all([store.reserve('one'), store.reserve('two')]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.availability()).available).toBe(false);
    await store.release(results[0] ? 'one' : 'two');
    expect((await store.availability()).available).toBe(true);
  });

  test('unknown usage stays conservatively charged; measured usage reconciles', async () => {
    await store.reserve('one');

    const id = await store.beginRequest('one', {});

    await store.settleRequest(id, null, {});

    let [r] = await store.db.query<any>('SELECT * FROM daily_usage');

    expect(Number(r.input_used)).toBe(INPUT_PER_REQUEST);
    expect(Number(r.output_used)).toBe(OUTPUT_PER_REQUEST);
    await store.settleRequest(id, { input: 123, output: 45 }, {});
    [r] = await store.db.query<any>('SELECT * FROM daily_usage');
    expect(Number(r.input_used)).toBe(123);
    expect(Number(r.output_used)).toBe(45);
    await store.release('one');
  });

  test('UTC reset preserves admission-day reservations for active games', async () => {
    const now = Date.UTC(2026, 8, 13, 23, 59, 59);

    await store.reserve('one', now);

    const id = await store.beginRequest('one', {});

    await store.settleRequest(id, { input: 3, output: 2 }, {});
    await store.reserve('two', now + 2000);

    const rows = await store.db.query<any>('SELECT * FROM daily_usage ORDER BY day');

    expect(rows).toHaveLength(2);
    expect(rows[0].day).toBe('2026-09-13');
    expect(Number(rows[0].input_used)).toBe(3);
    expect(Number(rows[1].input_used)).toBe(0);
  });
});

test('dynamic request top-ups, hedges and retries cannot overrun daily capacity', async () => {
  store.caps = { input: MATCH_INPUT + 1000, output: MATCH_OUTPUT };
  await store.reserve('one');

  const results = await Promise.allSettled([
    store.beginRequest('one', {}, { input: MATCH_INPUT, output: 400 }),
    store.beginRequest('one', {}, { input: MATCH_INPUT, output: 400 }),
  ]);

  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);

  const [day] = await store.db.query<any>('SELECT * FROM daily_usage');

  expect(Number(day.input_used) + Number(day.input_reserved)).toBeLessThanOrEqual(store.caps.input);
  await store.release('one');
  await expect(store.beginRequest('one', {}, { input: 1, output: 1 })).rejects.toThrow();
});

test('restart recovery retains conservative in-flight charges', async () => {
  const { m } = await question();

  await store.beginRequest(m.id, {}, { input: 18000, output: 400 });
  await store.recover();
  expect(await store.db.query('SELECT * FROM match_outcomes')).toHaveLength(0);

  const [day] = await store.db.query<any>('SELECT * FROM daily_usage');

  expect(Number(day.input_used)).toBe(18000);
  expect(Number(day.input_reserved)).toBe(0);
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
  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: '' });
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
    await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: '' });
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

  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: 'private explanation' });

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
  expect(commandSchema.safeParse({ type: 'create', role: 'either' }).success).toBe(false);
});
