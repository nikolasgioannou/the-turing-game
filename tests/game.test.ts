import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { database } from '../src/server/database';
import {
  Store,
  MATCH_INPUT,
  MATCH_OUTPUT,
  INPUT_PER_ROUND,
  OUTPUT_PER_ROUND,
} from '../src/server/store';
import { Game, type Peer, type Match } from '../src/server/game';
import type { AI, AIInput, AIOutput } from '../src/server/ai';
import { AIError } from '../src/server/ai';
import { characters, commandSchema, type Event, type RoomView } from '../src/shared/protocol';
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
describe('match authority and reveal', () => {
  test('AI sees current human answer; judge/spectators never receive pending answers or identity', async () => {
    const { h, j, m } = await pair();
    const s = await peer();
    await game.handle(s.p, { type: 'watch', id: m.id });
    await game.handle(j.p, { type: 'question', text: 'What did you eat?' });
    await game.handle(h.p, { type: 'answer', text: 'SECRET HUMAN ANSWER' });
    expect(lastInput.humanAnswer).toBe('SECRET HUMAN ANSWER');
    expect(lastInput.history).toHaveLength(0);
    for (const p of [j.p, s.p]) {
      const v = game.view(m, p);
      expect(v.rounds[0].answers).toBeNull();
      expect(v.ownLabel).toBeNull();
      expect(v.result).toBeNull();
      expect(JSON.stringify(v)).not.toContain('SECRET');
      expect(JSON.stringify(v)).not.toContain('humanSession');
    }
    await complete();
    expect(game.view(m, j.p).rounds[0].answers?.[m.humanLabel]).toBe('SECRET HUMAN ANSWER');
    expect(m.phase).toBe('question');
    await game.handle(j.p, { type: 'question', text: 'Why?' });
    await game.handle(h.p, { type: 'answer', text: 'NEW SECRET' });
    expect(JSON.stringify(lastInput.history)).toContain('SECRET HUMAN ANSWER');
    expect(lastInput.humanAnswer).toBe('NEW SECRET');
    expect(JSON.stringify(lastInput.history)).not.toContain('NEW SECRET');
    await complete();
  });
  test('five rounds then atomic verdict and reasoning; audience remains secret and locks', async () => {
    const { h, j, m } = await pair();
    const s = await peer();
    await game.handle(s.p, { type: 'watch', id: m.id });
    await game.handle(s.p, { type: 'vote', choice: 'A' });
    await game.handle(s.p, { type: 'vote', choice: 'B' });
    expect(game.view(m, j.p).result).toBeNull();
    expect(game.view(m, j.p).vote).toBeNull();
    await expect(game.handle(j.p, { type: 'verdict', choice: 'A' })).rejects.toThrow();
    for (let i = 0; i < 5; i++) {
      await game.handle(j.p, { type: 'question', text: `Question ${i}` });
      await game.handle(h.p, { type: 'answer', text: `Human ${i}` });
      await complete();
    }
    expect(m.phase).toBe('verdict');
    await game.handle(j.p, {
      type: 'verdict',
      choice: m.humanLabel,
      reason: 'The details felt real.',
    });
    const view = game.view(m, s.p);
    expect(view.result?.humanWon).toBe(true);
    expect(view.result?.reason).toBe('The details felt real.');
    expect(view.result?.votes).toEqual({ A: 0, B: 1 });
    await expect(game.handle(s.p, { type: 'vote', choice: 'A' })).rejects.toThrow();
    const saved = await store.load<Match>(m.id);
    expect(saved?.phase).toBe('complete');
    expect(game.view(saved!).result).toEqual(view.result);
  });
  test('cannot submit another role’s actions or self-match across tabs', async () => {
    const { h, j, m } = await pair();
    await expect(game.handle(h.p, { type: 'question', text: 'Hack' })).rejects.toThrow();
    await expect(game.handle(j.p, { type: 'answer', text: 'Hack' })).rejects.toThrow();
    const tab = await peer(h.p.session);
    await expect(game.handle(tab.p, { type: 'queue', role: 'judge' })).rejects.toThrow();
    await game.handle(tab.p, { type: 'watch', id: m.id });
    await expect(game.handle(tab.p, { type: 'vote', choice: 'A' })).rejects.toThrow();
  });
  test('invite seat requires secret token; match id grants viewing only', async () => {
    const h = await peer(),
      j = await peer(),
      s = await peer();
    await game.handle(h.p, { type: 'create', role: 'human' });
    const m = game.rooms.get(h.p.roomId!)!;
    await game.handle(s.p, { type: 'watch', id: m.id });
    expect(game.view(m, s.p).inviteToken).toBeUndefined();
    await expect(game.handle(j.p, { type: 'join', token: m.id })).rejects.toThrow();
    await game.handle(j.p, { type: 'join', token: m.inviteToken });
    expect(m.phase).toBe('question');
    await expect(game.handle(s.p, { type: 'join', token: m.inviteToken })).rejects.toThrow();
  });
});
describe('failure handling', () => {
  test('disconnect abandons and late AI completion cannot reveal or revive', async () => {
    const { h, j, m } = await pair();
    await game.handle(j.p, { type: 'question', text: 'Hi?' });
    await game.handle(h.p, { type: 'answer', text: 'Secret' });
    await game.disconnect(h.p);
    expect(m.phase).toBe('abandoned');
    await complete();
    expect(m.phase).toBe('abandoned');
    expect(game.view(m, j.p).rounds[0].answers).toBeNull();
    expect((await store.db.query('SELECT * FROM reservations')).length).toBe(0);
  });
  test('deadline enforced on action even before timer tick; spectator loss does not end match', async () => {
    const { h, j, m } = await pair();
    const s = await peer();
    await game.handle(s.p, { type: 'watch', id: m.id });
    await game.disconnect(s.p);
    expect(m.phase).toBe('question');
    clock += 90_001;
    await expect(game.handle(j.p, { type: 'question', text: 'Too late' })).rejects.toThrow();
    expect(m.phase).toBe('abandoned');
  });
  test('provider exhaustion pauses admission and preserves technical failure', async () => {
    const { h, j, m } = await pair();
    await game.handle(j.p, { type: 'question', text: 'Hi?' });
    await game.handle(h.p, { type: 'answer', text: 'Hello' });
    rejectAI(new AIError('402', 86_400_000));
    await new Promise((r) => setTimeout(r, 10));
    await game.run(async () => {});
    expect(m.phase).toBe('failed');
    expect((await store.availability()).available).toBe(false);
    expect(game.view(m).result).toBeNull();
  });
  test('restart marks unfinished records failed and preserves charged requests', async () => {
    const { m } = await pair();
    await store.beginRequest(m.id, { test: true });
    await store.recover();
    expect((await store.load<Match>(m.id))?.phase).toBe('failed');
    const [r] = await store.db.query<any>('SELECT * FROM daily_usage');
    expect(Number(r.input_used)).toBe(INPUT_PER_ROUND);
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
    expect(Number(r.input_used)).toBe(INPUT_PER_ROUND);
    expect(Number(r.output_used)).toBe(OUTPUT_PER_ROUND);
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
  expect(commandSchema.safeParse({ type: 'question', text: 'a'.repeat(301) }).success).toBe(false);
  expect(commandSchema.safeParse({ type: 'answer', text: 'a'.repeat(500) }).success).toBe(true);
});
