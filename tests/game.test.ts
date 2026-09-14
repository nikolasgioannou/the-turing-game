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
import { characters, commandSchema, type Event } from '../src/shared/protocol';

process.env.PGLITE_PATH = 'memory://';

let store: Store, game: Game, clock: number;
const sessions = new Map<string, { hooks: BotHooks; commands: BotCommand[]; stopped: boolean }>();
const ai: AI = {
  model: 'test',
  start(id, label, hooks) {
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
  await store.db.query('TRUNCATE matches,ai_requests,reservations,daily_usage');
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

async function pair() {
  const h = await peer(),
    j = await peer();

  await game.handle(h.p, { type: 'queue', role: 'human' });
  await game.handle(j.p, { type: 'queue', role: 'judge' });

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

test('opening answer remains private until the worker reveals it; clock comes from reference', async () => {
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

test('reference can start before the human sends; subsequent human reply is public', async () => {
  const { h, m } = await question();

  await emit(m, [
    { id: 'ai', from: m.humanLabel === 'A' ? 'B' : 'A', text: 'trust', ts: clock / 1000 },
  ]);

  expect(m.phase).toBe('chat');
  expect(m.messages).toHaveLength(2);
  await game.handle(h.p, { type: 'message', text: 'care' });
  expect(m.messages.at(-1)?.text).toBe('care');
});

test('drafts in opening and live chat go only to worker, including deletion and hints', async () => {
  const { h, j, m } = await question();
  const spectator = await peer();

  await game.handle(spectator.p, { type: 'watch', id: m.id });
  await expect(game.handle(j.p, { type: 'draft', text: 'secret' })).rejects.toThrow();
  await expect(game.handle(spectator.p, { type: 'draft', text: 'secret' })).rejects.toThrow();
  await game.handle(h.p, { type: 'draft', text: 'private draft' });
  expect(sessions.get(m.id)!.commands.at(-1)).toEqual({ type: 'draft', text: 'private draft' });
  await game.persist(m);
  expect(JSON.stringify(await store.load(m.id))).not.toContain('private draft');
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

  await game.handle(spectator.p, { type: 'watch', id: m.id });
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

test('early verdict commits reason and identity together, cancels work and settles outstanding usage', async () => {
  const { j, m } = await opening();
  const hooks = sessions.get(m.id)!.hooks;
  const request = await hooks.reserve({ input: 12345, output: 400 });

  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: 'guess' });
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

  await game.handle(j.p, { type: 'watch', id: m.id });
  expect(game.role(m, j.p)).toBe('spectator');
  expect(game.view(m, j.p).inviteToken).toBeUndefined();
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
  expect(game.view(m).result).toBeNull();

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
  expect(game.view(m).result).toBeNull();
});

test('historical replay scoring remains unchanged', async () => {
  const { j, m } = await opening();

  delete m.guessTarget;
  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: '' });
  expect(game.view(m).result?.humanWon).toBe(true);
  expect(game.view(m).result?.guessTarget).toBe('human');
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
  expect((await store.load<Match>(m.id))?.phase).toBe('failed');

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
