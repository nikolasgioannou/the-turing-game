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

async function complete(text = 'AI ANSWER', deliver = true) {
  resolveAI({ text, usage: { input: 100, output: 25 }, provider: 'test', model: 'test' });
  await new Promise((r) => setTimeout(r, 10));
  await game.run(async () => {});

  if (deliver) {
    for (const pending of game['pendingReplies'].values()) clock = Math.max(clock, pending.due);

    await game.tick();
  }
}

async function opening() {
  const pairState = await pair();

  await game.handle(pairState.j.p, { type: 'message', text: 'What did you eat?' });
  await game.handle(pairState.h.p, { type: 'message', text: 'pasta lol' });

  return pairState;
}

describe('paired opening and group chat', () => {
  test('opening is hidden, pair reveals atomically, 90-second clock begins only after reveal', async () => {
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
    expect(m.deadline).toBe(clock + 90_000);
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
    await game.handle(h.p, { type: 'draft', text: 'still thinking' });
    clock = m.aiDueAt! + 1;
    await game.tick();
    expect(lastInput.privateOpeningReference).toBeUndefined();
    expect(lastInput.messages.at(-1)?.text).toBe('tell me more');

    const requests = m.aiRequests;

    clock += 1000;
    await game.handle(h.p, { type: 'message', text: 'still here' });
    await game.tick();
    expect(m.aiRequests).toBe(requests);
    await complete('AI ANSWER');
    expect(game.view(m).messages.at(-1)?.text).toBe('still here');
    clock = m.aiDueAt! + 1;
    await game.tick();
    expect(lastInput.messages.at(-1)?.text).toBe('still here');
    await complete('yeah im listening');
    expect(game.view(m).messages.at(-1)?.text).toBe('yeah im listening');
    expect(m.deadline).toBe(deadline);
  });

  test('at 90 seconds messages and audience lock; verdict and reason commit together', async () => {
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
    const { h, m } = await opening();

    await complete();
    await game.handle(h.p, { type: 'message', text: 'why did you say that?' });
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

  test('quiet and parallel answers do not trigger calls; clear peer questions do', async () => {
    const { h, m } = await opening();

    await complete('pizza');

    const requests = m.aiRequests;

    clock += 15000;
    await game.tick();
    expect(m.aiDueAt).toBeNull();
    expect(m.aiRequests).toBe(requests);
    await game.handle(h.p, { type: 'message', text: 'wont tell you that' });
    expect(m.aiDueAt).toBeNull();
    await game.handle(h.p, { type: 'message', text: 'why did you pick that?' });
    clock = m.aiDueAt! + 1;
    await game.tick();
    expect(m.aiRequests).toBe(requests + 1);
    expect(lastInput.invocation?.target).toBe('opponent');
    await complete('[WAIT]');
    expect(m.aiDueAt).toBeNull();
    m.aiRequests = LIMITS.aiRequests;
    await game.handle(h.p, { type: 'message', text: 'can you explain?' });
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
  test('explicit leave abandons and late opening completion cannot reveal', async () => {
    const { h, m } = await opening();

    await game.handle(h.p, { type: 'leave' });
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

test('multiline replies arrive separately with length-based delays and stop at deadline', async () => {
  const { m } = await opening();

  await complete('hey\n\nthis is a longer follow up\r\nlast bit');
  expect(m.messages).toHaveLength(3);
  expect(m.messages.some((x) => x.text === 'hey')).toBe(true);
  expect(m.messages.some((x) => x.text.includes('longer'))).toBe(false);

  const requests = m.aiRequests;

  clock += 650;
  await game.tick();
  expect(m.messages).toHaveLength(3);
  clock += 6000;
  await game.tick();
  expect(m.messages.at(-1)?.text).toBe('this is a longer follow up');
  expect(m.aiRequests).toBe(requests);
  clock = m.deadline!;
  await game.tick();
  expect(m.phase).toBe('verdict');
  expect(m.messages.some((x) => x.text === 'last bit')).toBe(false);
});

test('disconnect preserves pending reply lines', async () => {
  const { m, h } = await opening();

  await complete('hey\nmore');
  await game.disconnect(h.p);
  clock += 5000;
  await game.tick();
  expect(m.messages.some((x) => x.text === 'more')).toBe(true);
});

test('message bursts use the latest human evidence and explain new input', async () => {
  const { h, j, m } = await opening();

  await complete('hey');

  const start = clock;

  await game.handle(h.p, { type: 'message', text: 'one' });

  clock += 1000;
  await game.handle(j.p, { type: 'message', text: 'two' });
  expect(m.aiDueAt).toBe(clock + 1200);

  for (let i = 0; i < 3; i++) {
    clock += 1000;
    await game.handle(h.p, { type: 'message', text: `more ${i}` });
  }

  expect(m.aiDueAt!).toBe(start + 4000 + 650);
  clock = m.aiDueAt! + 1;
  await game.tick();
  expect(lastInput.invocation?.newHumanMessages).toBe(5);
  await complete('[WAIT]');
  expect(m.aiDueAt).toBeNull();
});

test('repeated opening output is suppressed regardless of public reveal order', async () => {
  const { h, m } = await opening();

  await complete('me obviously');
  // Force the public order that previously bypassed the duplicate check.
  m.messages.splice(1, 2, ...m.messages.slice(1).sort((a) => (a.sender === m.humanLabel ? 1 : -1)));
  await game.handle(h.p, { type: 'message', text: 'why are you human?' });
  clock = m.aiDueAt! + 1;
  await game.tick();
  await complete('me obviously');
  expect(m.messages.filter((x) => x.text === 'me obviously')).toHaveLength(1);
  expect(m.aiDueAt).toBeNull();

  const requests = m.aiRequests;

  clock += 12000;
  await game.tick();
  expect(m.aiRequests).toBe(requests);
});

test('new input interrupts queued lines without charging extra calls for those lines', async () => {
  const { h, m } = await opening();

  await complete('hey\nold follow up');
  await game.handle(h.p, { type: 'message', text: 'why did you say that?' });
  clock = m.aiDueAt! + 1;
  await game.tick();
  expect(m.aiRequests).toBe(2);
  expect(lastInput.messages.some((x) => x.text === 'old follow up')).toBe(false);
  await complete('fresh reply');
  expect(m.messages.some((x) => x.text === 'old follow up')).toBe(false);
  expect(m.messages.at(-1)?.text).toBe('fresh reply');
});

test('a multiline peer reply is one contribution and cannot poll again', async () => {
  const { h, m } = await opening();

  await complete('hey');
  await game.handle(h.p, { type: 'message', text: 'what do you think?' });
  clock = m.aiDueAt! + 1;
  await game.tick();
  await complete('anyway\nwhat do you think\nabout that');

  for (let i = 0; i < 2; i++) {
    clock += 4000;
    await game.tick();
  }

  expect(m.messages.at(-1)?.text).toBe('about that');
  expect(m.aiRequests).toBe(2);
  expect(m.aiDueAt).toBeNull();
});

test('publication waits for thinking plus typing measured from invocation', async () => {
  const { m } = await opening();
  const start = clock;

  await complete('a moderately long opening response', false);
  expect(m.messages).toHaveLength(1);
  expect(m.phase).toBe('opening_ai');

  const due = game['pendingReplies'].get(m.id)!.due;

  expect(due - start).toBeGreaterThan(4000);
  clock = due - 1;
  await game.tick();
  expect(m.messages).toHaveLength(1);
  clock = due;
  await game.tick();
  expect(m.messages).toHaveLength(3);
  expect(m.startedAt).toBe(due);
});

test('slow generation consumes the publication delay instead of adding it twice', async () => {
  const { m } = await opening();

  clock += 20000;
  await complete('hey', false);
  expect(m.phase).toBe('chat');
  expect(m.messages).toHaveLength(3);
  expect(game['pendingReplies'].has(m.id)).toBe(false);
});

test('refresh restores the session seat and private opening without changing the clock', async () => {
  const { h, j, m } = await opening();

  await game.disconnect(h.p);

  const restored = await peer(h.p.session);

  expect(restored.p.roomId).toBe(m.id);
  expect(game.view(m, restored.p).ownOpening).toBe('pasta lol');
  expect(game.view(m, j.p).ownOpening).toBeNull();
  expect(game.view(m, (await peer()).p).ownOpening).toBeNull();
  await complete('hey');

  const deadline = m.deadline;
  const requests = m.aiRequests;
  // New socket may arrive before the old socket closes; either order is safe.
  const judge = await peer(j.p.session);

  await game.disconnect(j.p);
  await game.handle(judge.p, { type: 'watch', id: m.id });
  await game.handle(judge.p, { type: 'message', text: 'still here' });
  expect(game.role(m, judge.p)).toBe('judge');
  expect(m.messages.at(-1)?.sender).toBe('judge');
  expect(m.deadline).toBe(deadline);
  expect(m.aiRequests).toBe(requests);
  await expect(game.handle(restored.p, { type: 'create', role: 'human' })).rejects.toThrow();
  await game.disconnect(restored.p);
  await game.disconnect(judge.p);
  clock = deadline!;
  await game.tick();
  expect(m.phase).toBe('verdict');

  const returnJudge = await peer(j.p.session);

  expect(game.view(m, returnJudge.p).phase).toBe('verdict');
  await game.handle(returnJudge.p, { type: 'verdict', choice: m.humanLabel, reason: '' });
  expect(m.phase).toBe('complete');
});

describe('private contestant drafts', () => {
  test('only contestant drafts reach AI context and never broadcasts or saved matches', async () => {
    const { h, j, m } = await opening();

    await complete();

    const spectator = await peer();

    await game.handle(spectator.p, { type: 'watch', id: m.id });

    const requests = m.aiRequests;

    await expect(game.handle(j.p, { type: 'draft', text: 'judge draft' })).rejects.toThrow();

    await expect(
      game.handle(spectator.p, { type: 'draft', text: 'spectator draft' }),
    ).rejects.toThrow();

    await game.handle(j.p, { type: 'message', text: 'what do you think' });

    const publicEvents = JSON.stringify([h.events, j.events, spectator.events]);

    await game.handle(h.p, { type: 'draft', text: 'ur joking right' });
    expect(m.aiRequests).toBe(requests);
    expect(JSON.stringify([h.events, j.events, spectator.events])).toBe(publicEvents);
    expect(JSON.stringify(await store.load(m.id))).not.toContain('ur joking right');
    clock += 801;
    await game.generate(m);
    expect(lastInput.opponentDraft).toBe('ur joking right');
    expect(lastInput.messages.some((message) => message.text === 'ur joking right')).toBe(false);
    await complete('no way');
    await game.handle(h.p, { type: 'message', text: 'why did you say that?' });
    clock += 901;
    await game.generate(m);
    expect(lastInput.opponentDraft).toBeUndefined();
    await complete();
  });

  test('drafts clear on deletion, disconnect, timeout and chat closure', async () => {
    const { h, m } = await opening();

    await complete();
    await game.handle(h.p, { type: 'draft', text: 'unfinished' });
    await game.handle(h.p, { type: 'draft', text: '' });
    expect(game['drafts'].has(m.id)).toBe(false);
    await game.handle(h.p, { type: 'draft', text: 'unfinished' });
    await game.disconnect(h.p);
    expect(game['drafts'].has(m.id)).toBe(false);
    await game.connect(h.p);
    await game.handle(h.p, { type: 'draft', text: 'unfinished' });
    clock += 15_001;
    m.aiDueAt = null;
    await game.tick();
    expect(game['drafts'].has(m.id)).toBe(false);
    await game.handle(h.p, { type: 'draft', text: 'unfinished' });
    await game.expire(m);
    expect(game['drafts'].has(m.id)).toBe(false);
    await game.handle(h.p, { type: 'draft', text: 'late update' });
    expect(game['drafts'].has(m.id)).toBe(false);
    expect(commandSchema.safeParse({ type: 'draft', text: 'x'.repeat(501) }).success).toBe(false);
  });
});

test('draft revisions cancel stale work but eventually fall back to an independent answer', async () => {
  const { h, j, m } = await opening();

  await complete('pizza');
  await game.handle(j.p, { type: 'message', text: 'Whats your full address?' });

  const requests = m.aiRequests;

  clock += 100;
  await game.generate(m);
  expect(m.aiRequests).toBe(requests);
  expect(m.aiDueAt).not.toBeNull();
  await game.handle(h.p, { type: 'draft', text: 'wont tell you that' });
  clock += 799;
  await game.generate(m);
  expect(m.aiRequests).toBe(requests);
  clock += 2;
  await game.generate(m);
  expect(lastInput.opponentDraft).toBe('wont tell you that');
  expect(lastInput.invocation?.target).toBe('judge');
  await game.handle(h.p, { type: 'draft', text: 'why do you need it' });
  await complete('stale refusal', false);
  expect(game['pendingReplies'].has(m.id)).toBe(false);
  clock += 801;
  await game.generate(m);
  expect(lastInput.opponentDraft).toBe('why do you need it');
  await complete('another stale reply', false);
  expect(game['pendingReplies'].has(m.id)).toBe(true);
  await game.handle(h.p, { type: 'draft', text: '' });
  expect(game['pendingReplies'].has(m.id)).toBe(false);
  clock += 5000;
  await game.tick();
  expect(m.messages.some((message) => message.text.includes('stale'))).toBe(false);
  expect(lastInput.invocation?.evidence).toBe('question');
  await complete('not sharing that');
  expect(m.messages.at(-1)?.text).toBe('not sharing that');
});

test('early judge verdict finishes atomically and rejects late AI output and votes', async () => {
  const { h, j, m } = await opening();

  await expect(game.handle(j.p, { type: 'verdict', choice: 'A' })).rejects.toThrow();
  await complete('pizza');

  const spectator = await peer();

  await game.handle(spectator.p, { type: 'watch', id: m.id });
  await game.handle(spectator.p, { type: 'vote', choice: 'A' });
  await game.handle(h.p, { type: 'message', text: 'why did you say that?' });
  clock = m.aiDueAt! + 1;
  await game.tick();
  expect(game.controllers.has(m.id)).toBe(true);
  await expect(game.handle(h.p, { type: 'verdict', choice: 'A' })).rejects.toThrow();
  await expect(game.handle(spectator.p, { type: 'verdict', choice: 'A' })).rejects.toThrow();

  const count = m.messages.length;

  await game.handle(j.p, { type: 'verdict', choice: m.humanLabel, reason: 'Ready to guess' });
  expect(m.phase).toBe('complete');
  expect(m.deadline).toBeNull();
  expect(game.view(m).result?.humanWon).toBe(true);
  expect(game.view(m).result?.reason).toBe('Ready to guess');
  expect((await store.load<Match>(m.id))?.phase).toBe('complete');
  await expect(game.handle(spectator.p, { type: 'vote', choice: 'B' })).rejects.toThrow();
  await expect(game.handle(h.p, { type: 'message', text: 'late' })).rejects.toThrow();
  await complete('late AI');
  expect(m.messages).toHaveLength(count);
});

test('submitted-turn replies survive new questions during generation and typing', async () => {
  const { h, j, m } = await opening();

  await complete('caring about someone');
  await game.handle(j.p, { type: 'message', text: 'when did you first feel it?' });

  const question = m.messages.at(-1)!.id;

  await game.handle(h.p, { type: 'message', text: 'when i was in my early 20s' });
  clock += 651;
  await game.tick();
  expect(m.aiRequests).toBe(2);
  await game.handle(j.p, { type: 'message', text: 'where' });
  await complete('when i was younger', false);
  expect(game['pendingReplies'].has(m.id)).toBe(true);
  await game.handle(h.p, { type: 'message', text: 'at my home' });

  const nextQuestion = m.messages.find((message) => message.text === 'where')!.id;
  const due = game['pendingReplies'].get(m.id)!.due;

  clock = due;
  await game.tick();
  expect(m.messages.at(-1)?.text).toBe('when i was younger');
  expect(m.messages.at(-1)?.replyTo).toBe(question);
  expect(m.aiRequests).toBe(3);
  await complete('at school', false);
  await game.handle(j.p, { type: 'message', text: 'with who' });
  clock = game['pendingReplies'].get(m.id)!.due;
  await game.tick();
  expect(m.messages.at(-1)?.text).toBe('at school');
  expect(m.messages.at(-1)?.replyTo).toBe(nextQuestion);
  expect(m.aiDueAt).toBeNull();
  expect(game.view(m).messages.every((message) => message.replyTo === undefined)).toBe(true);
});

test('AI answers a live judge question first without human typing and does not loop', async () => {
  const { j, m } = await opening();

  await complete('hey');
  await game.handle(j.p, { type: 'message', text: 'whats the meaning of life' });
  clock += 1201;
  await game.tick();
  expect(m.aiRequests).toBe(2);
  expect(lastInput.invocation?.evidence).toBe('question');
  expect(lastInput.opponentDraft).toBeUndefined();
  await complete('enjoying it i guess');
  expect(m.messages.at(-1)?.text).toBe('enjoying it i guess');
  clock += 10000;
  await game.tick();
  expect(m.aiRequests).toBe(2);
  expect(m.aiDueAt).toBeNull();
});
