import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { database } from '../src/server/database';
import {
  Store,
  MATCH_INPUT,
  MATCH_OUTPUT,
  INPUT_PER_REQUEST,
  OUTPUT_PER_REQUEST,
} from '../src/server/store';
import { Game, type Peer, type Match } from '../src/server/game';
import type { AI, AIInput, AIOutput } from '../src/server/ai';
import { AIError } from '../src/server/ai';
import {
  characters,
  commandSchema,
  LIMITS,
  type Event,
  type RoomView,
} from '../src/shared/protocol';
process.env.PGLITE_PATH = 'memory://';
let store: Store,
  game: Game,
  clock: number,
  resolveAI: (r: AIOutput) => void,
  rejectAI: (e: Error) => void,
  lastInput: AIInput;
const ai: AI = {
  mock: true,
  model: 'test',
  complete(input) {
    lastInput = input;
    return new Promise((resolve, reject) => {
      resolveAI = resolve;
      rejectAI = reject;
    });
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
async function complete(text = 'AI ANSWER') {
  resolveAI({ text, usage: { input: 100, output: 25 }, provider: 'test', model: 'test' });
  await new Promise((r) => setTimeout(r, 10));
  await game.run(async () => {});
}
async function opening() {
  const pairState = await pair();
  await game.handle(pairState.j.p, { type: 'message', text: 'What did you eat?' });
  await game.handle(pairState.h.p, { type: 'message', text: 'pasta lol' });
  return pairState;
}
describe('paired opening and group chat', () => {
  test('opening is hidden, pair reveals atomically, minute begins only after reveal', async () => {
    const { h, j, m } = await pair();
    const s = await peer();
    await game.handle(s.p, { type: 'watch', id: m.id });
    await expect(game.handle(h.p, { type: 'message', text: 'early' })).rejects.toThrow();
    await game.handle(j.p, { type: 'message', text: 'What did you eat?' });
    clock += 20_000;
    await game.handle(h.p, { type: 'message', text: 'SECRET HUMAN ANSWER' });
    expect(lastInput.privateOpeningReference).toBe('SECRET HUMAN ANSWER');
    expect(lastInput.messages).toHaveLength(1);
    expect(m.startedAt).toBeNull();
    for (const p of [j.p, s.p]) {
      const v = game.view(m, p);
      expect(v.messages).toHaveLength(1);
      expect(v.ownLabel).toBeNull();
      expect(v.result).toBeNull();
      expect(JSON.stringify(v)).not.toContain('SECRET');
      expect(JSON.stringify(v)).not.toContain('humanSession');
    }
    await expect(game.handle(j.p, { type: 'message', text: 'too soon' })).rejects.toThrow();
    clock += 5000;
    await complete();
    const view = game.view(m, j.p);
    expect(view.messages).toHaveLength(3);
    expect(
      view.messages
        .slice(1)
        .map((x) => x.text)
        .sort(),
    ).toEqual(['AI ANSWER', 'SECRET HUMAN ANSWER']);
    expect(new Set(view.messages.slice(1).map((x) => x.sentAt)).size).toBe(1);
    expect(m.startedAt).toBe(clock);
    expect(m.deadline).toBe(clock + 60_000);
    expect(m.phase).toBe('chat');
  });
  test('all participants can chat immediately while one AI request is pending', async () => {
    const { h, j, m } = await opening();
    await complete();
    clock += 1000;
    const deadline = m.deadline;
    await game.handle(h.p, { type: 'message', text: 'what about you B?' });
    await game.handle(j.p, { type: 'message', text: 'tell me more' });
    expect(game.view(m, j.p).messages.at(-2)?.text).toBe('what about you B?');
    clock = m.aiDueAt! + 1;
    await game.tick();
    expect(lastInput.privateOpeningReference).toBeUndefined();
    expect(lastInput.messages.at(-1)?.text).toBe('tell me more');
    const requests = m.aiRequests;
    clock += 1000;
    await game.handle(h.p, { type: 'message', text: 'still here' });
    await game.tick();
    expect(m.aiRequests).toBe(requests);
    await complete('yeah me too');
    expect(game.view(m).messages.at(-1)?.text).toBe('yeah me too');
    expect(m.deadline).toBe(deadline);
  });
  test('at 60 seconds messages and audience lock; verdict and reason commit together', async () => {
    const { h, j, m } = await opening();
    const s = await peer();
    await game.handle(s.p, { type: 'watch', id: m.id });
    await game.handle(s.p, { type: 'vote', choice: 'B' });
    await expect(game.handle(j.p, { type: 'verdict', choice: 'A' })).rejects.toThrow();
    await complete();
    clock = m.deadline!;
    await expect(game.handle(h.p, { type: 'message', text: 'late' })).rejects.toThrow();
    expect(m.phase).toBe('verdict');
    await expect(game.handle(s.p, { type: 'vote', choice: 'A' })).rejects.toThrow();
    await game.handle(j.p, {
      type: 'verdict',
      choice: m.humanLabel,
      reason: 'The details felt real.',
    });
    expect(game.view(m).result?.humanWon).toBe(true);
    expect(game.view(m).result?.votes).toEqual({ A: 0, B: 1 });
    expect(game.view(m).result?.reason).toBe('The details felt real.');
    expect((await store.load<Match>(m.id))?.phase).toBe('complete');
  });
  test('timer tick locks chat and discards a late AI response without a provider outage', async () => {
    const { m } = await opening();
    await complete();
    clock = m.aiDueAt! + 1;
    await game.tick();
    const count = m.messages.length;
    clock = m.deadline!;
    await game.tick();
    await complete('too late');
    expect(m.phase).toBe('verdict');
    expect(m.messages).toHaveLength(count);
    expect((await store.availability()).available).toBe(true);
  });
  test('spectators cannot send and another tab cannot take a seat or vote', async () => {
    const { h, m } = await pair();
    const tab = await peer(h.p.session);
    await expect(game.handle(tab.p, { type: 'queue', role: 'judge' })).rejects.toThrow();
    await game.handle(tab.p, { type: 'watch', id: m.id });
    await expect(game.handle(tab.p, { type: 'message', text: 'hack' })).rejects.toThrow();
    await expect(game.handle(tab.p, { type: 'vote', choice: 'A' })).rejects.toThrow();
  });
  test('invite token reserves seats; match id only grants viewing', async () => {
    const h = await peer(),
      j = await peer(),
      s = await peer();
    await game.handle(h.p, { type: 'create', role: 'human' });
    const m = game.rooms.get(h.p.roomId!)!;
    await game.handle(s.p, { type: 'watch', id: m.id });
    expect(game.view(m, s.p).inviteToken).toBeUndefined();
    await expect(game.handle(j.p, { type: 'join', token: m.id })).rejects.toThrow();
    await game.handle(j.p, { type: 'join', token: m.inviteToken });
    expect(m.phase).toBe('ready');
  });
  test('AI initiates after quiet periods but never exceeds reserved requests', async () => {
    const { m } = await opening();
    await complete();
    clock = m.aiDueAt! + 1;
    await game.tick();
    expect(m.aiRequests).toBe(2);
    await complete('[WAIT]');
    expect(m.messages).toHaveLength(3);
    m.aiRequests = LIMITS.aiRequests;
    clock = m.aiDueAt! + 1;
    await game.tick();
    expect(game.controllers.has(m.id)).toBe(false);
  });
  test('old replay mapping does not expose unfinished private answers', async () => {
    const { m } = await pair();
    const legacy = {
      ...m,
      messages: undefined,
      rounds: [{ question: 'old', askedAt: clock, human: 'SECRET', ai: null, revealedAt: null }],
    } as unknown as Match;
    expect(JSON.stringify(game.view(legacy))).not.toContain('SECRET');
    expect(game.view(legacy).messages).toHaveLength(1);
  });
});
describe('failure handling', () => {
  test('disconnect abandons and late opening completion cannot reveal', async () => {
    const { h, m } = await opening();
    await game.disconnect(h.p);
    await complete();
    expect(m.phase).toBe('abandoned');
    expect(game.view(m).messages).toHaveLength(1);
    expect((await store.db.query('SELECT * FROM reservations')).length).toBe(0);
  });
  test('opening timeout abandons; spectator disconnect does not', async () => {
    const { j, m } = await pair();
    const s = await peer();
    await game.handle(s.p, { type: 'watch', id: m.id });
    await game.disconnect(s.p);
    expect(m.phase).toBe('ready');
    clock += 90_001;
    await expect(game.handle(j.p, { type: 'message', text: 'late' })).rejects.toThrow();
    expect(m.phase).toBe('abandoned');
  });
  test('provider exhaustion pauses admission and preserves technical failure', async () => {
    const { m } = await opening();
    rejectAI(new AIError('402', 86_400_000));
    await new Promise((r) => setTimeout(r, 10));
    await game.run(async () => {});
    expect(m.phase).toBe('failed');
    expect((await store.availability()).available).toBe(false);
    expect(game.view(m).result).toBeNull();
  });
  test('restart preserves charged requests', async () => {
    const { m } = await pair();
    await store.beginRequest(m.id, { test: true });
    await store.recover();
    expect((await store.load<Match>(m.id))?.phase).toBe('failed');
    const [r] = await store.db.query<any>('SELECT * FROM daily_usage');
    expect(Number(r.input_used)).toBe(INPUT_PER_REQUEST);
    expect(Number(r.input_reserved)).toBe(0);
  });
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
test('Unicode-aware character counter and server limits', () => {
  expect(characters('👨‍👩‍👧‍👦')).toBe(1);
  expect(characters('é')).toBe(1);
  expect(commandSchema.safeParse({ type: 'message', text: 'a'.repeat(501) }).success).toBe(false);
  expect(commandSchema.safeParse({ type: 'message', text: 'a'.repeat(500) }).success).toBe(true);
});
