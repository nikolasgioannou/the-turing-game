import { SYSTEM, STYLE_ANALYSIS } from '../src/server/bot/constants';
import plans from './fixtures/brain-plans.json';
import filtering from './fixtures/brain-filtering.json';
import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { Game } from '../src/server/bot/brain';
import { similarity } from '../src/server/bot/runtime';
import fixtures from './fixtures/brain-behavior.json';
import ratios from './fixtures/similarity.json';
import type { Completion } from '../src/server/ai';

function setup(random = 0.5) {
  let time = 1000;
  const calls: Completion[] = [];
  const game = new Game('test', 'A', {
    now: () => time,
    random: () => random,
    sleep: async (seconds) => {
      time += Math.max(0, seconds);
    },
    broadcast: () => {},
    failed: (error) => {
      throw error;
    },
    complete: async (params) => {
      calls.push(params);

      return '{"send":false}';
    },
  });

  return { game, calls };
}

for (const [index, fixture] of fixtures.entries())
  test(`conversation behavior fixture ${index}`, async () => {
    const { game, calls } = setup(fixture.random);

    Object.assign(game, structuredClone(fixture.state));

    const expected = fixture.expected;

    for (const method of [
      'style_profile',
      'style_rules',
      'voice_samples',
      'transcript',
      'people_facts',
      'human_makes_typos',
      'judge_asked_effort',
      'judge_asked_trivia',
      'judge_asked_complex',
      'judge_unanswered',
      'human_complied',
      'accusation_evidence',
      'frantic',
      'draft_is_weird',
    ] as const)
      expect(game[method](), method).toEqual(expected[method]);

    expect(game.normalize(fixture.text)).toBe(expected.normalize);
    expect(game.add_typo(fixture.text)).toBe(expected.add_typo);
    expect(game.weird_traits(fixture.state.messages.at(-1)!.text)).toEqual(expected.weird_traits);
    expect(game.type_time(fixture.text)).toBeCloseTo(expected.type_time, 10);
    expect(game.typing_floor(fixture.text, 990)).toBeCloseTo(expected.typing_floor, 10);
    await game.generate('message');

    const prompt = calls[0].messages[0].content;

    expect(createHash('sha256').update(prompt).digest('hex'), 'prompt hash').toBe(
      expected.promptHash,
    );
  });

test('similarity matching blocks and Unicode preserve ordering', () => {
  for (const { a, b, ratio } of ratios) expect(similarity(a, b)).toBe(ratio);
});

test('opening holds replies in order and starts a 90 second clock', async () => {
  const { game } = setup();

  await game.on_message('judge', 'what is love');
  await game.on_message('player', 'caring');
  expect(game.messages).toHaveLength(1);
  expect(game.held_first?.text).toBe('caring');
  game.gen = async () => ['trust'];
  await game.first_exchange(false);
  expect(game.messages.map((m) => m.text)).toEqual(['what is love', 'caring', 'trust']);
  expect(game.phase).toBe('live');
  expect(game.ends_at! - game.live_started!).toBe(90);
});

test('opening attack can arrive without a human submission', async () => {
  const { game } = setup();

  await game.on_message('judge', 'hello');
  game.gen = async () => ['hi'];
  await game.first_exchange(true);
  expect(game.messages.map((m) => m.text)).toEqual(['hello', 'hi']);
  expect(game.phase).toBe('live');
});

test('live questions retain both independent and draft reading plans', () => {
  const { game } = setup(0.1);

  game.phase = 'live';

  const msg = { id: 'j', from: 'judge' as const, text: 'what is love', ts: 100 };

  game.messages = [msg];
  game.new_plan(msg, 100);
  expect(game.plan?.blind).toBe(true);
  expect(game.plan?.land_at).toBe(101.75);

  const { game: other } = setup(0.9);

  other.phase = 'live';
  other.messages = [msg];
  other.new_plan(msg, 100);
  expect(other.plan?.beat).toBe(true);
  expect(other.plan!.land_at!).toBeGreaterThanOrEqual(108);
  expect(other.plan!.land_at!).toBeLessThanOrEqual(120);
});

test('style analysis uses 500 tokens and 20 second timeout', async () => {
  const { game } = setup();
  const calls: { params: Completion; timeout: number }[] = [];

  game.options.complete = async (params, timeout) => {
    calls.push({ params, timeout });

    return 'style card';
  };

  await game.on_message('judge', 'what is love');
  await game.on_message('player', 'ur mom');
  await game.analyze_style();
  expect(game.style_card).toBe('style card');
  expect(calls[0].params.max_tokens).toBe(500);
  expect(calls[0].timeout).toBe(20);
  expect(calls[0].params.messages[0].content).toContain('ur mom');
});

test('hedge starts after 2.5 seconds and cancels the losing request', async () => {
  const { game } = setup();
  let calls = 0,
    cancelled = false;

  game.options.complete = async (_params, _timeout, signal) => {
    calls++;

    if (calls === 2) return 'second won';

    return new Promise<string>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          cancelled = true;
          reject(signal.reason);
        },
        { once: true },
      );
    });
  };

  expect(await game.hedged_create({ system: 'test', messages: [], max_tokens: 400 })).toBe(
    'second won',
  );

  expect(calls).toBe(2);
  expect(cancelled).toBe(true);
});

test('stopping cancels pending delivery without late messages', async () => {
  const { game } = setup();

  game.phase = 'live';

  game.options.sleep = async () => {
    game.stop();
    game.lifetime.signal.throwIfAborted();
  };

  await expect(game.deliver(['late'])).rejects.toThrow();
  await Bun.sleep(0);
  expect(game.messages).toEqual([]);
});

for (const [index, fixture] of plans.entries())
  test(`planning fixture ${index}`, () => {
    const { game } = setup(fixture.random);

    Object.assign(game, structuredClone(fixture.state));
    game.new_plan(game.messages.at(-1)!, 1000);

    for (const key of [
      'plan',
      'plan_done_ts',
      'last_accused',
      'pending_accuse',
      'spat_until',
      'accuse_chances',
    ] as const)
      expect(game[key], key).toEqual(fixture.expected[key]);
  });

for (const [index, fixture] of filtering.entries())
  test(`filtering fixture ${index}`, async () => {
    const { game, calls } = setup();

    Object.assign(game, structuredClone(fixture.state));

    game.options.complete = async (params) => {
      const index = calls.length;

      calls.push(params);

      return fixture.responses[Math.min(index, fixture.responses.length - 1)];
    };

    expect(await game.generate('sent')).toEqual(fixture.result);

    expect(
      calls.map((c) => createHash('sha256').update(c.messages[0].content).digest('hex')),
    ).toEqual(fixture.prompts);
  });

test('system and analyst prompts preserve their text', () => {
  expect(createHash('sha256').update(SYSTEM).digest('hex')).toBe(
    'd70b4e5618a990fc88a4abd77a1c5df8b672fa71f898cca4390ad3a89c3e1077',
  );

  expect(createHash('sha256').update(STYLE_ANALYSIS).digest('hex')).toBe(
    'e48e8b868639764cbf3b855d3a3250a694e78ab8909b53a5581be3f931dd6d70',
  );
});

test('JSON parsing retains silence, bubble order and draft disclosure status', () => {
  const { game } = setup();

  expect(game.parse('{"send":false,"messages":["unused"]}')).toEqual([]);

  expect(game.parse('{"send":true,"messages":["one","two"],"draft_reveals_answer":true}')).toEqual([
    'one',
    'two',
  ]);

  expect(game.last_reveals).toBe(true);
  expect(game.parse('not json')).toBeNull();
});

test('an emoji-only human reply is mirrored with an emoji, even if the model insists on words', async () => {
  const { game, calls } = setup(0.5);

  Object.assign(game, {
    phase: 'live',
    live_started: 950,
    ends_at: 1040,
    ai_last_sent: 960,
    human_label: 'B',
    ai_label: 'A',
    messages: [
      { id: '1', from: 'judge', text: 'whats up', ts: 955 },
      { id: '2', from: 'A', text: 'not much', ts: 960 },
      { id: '3', from: 'B', text: '💙', ts: 970 },
    ],
  });

  game.options.complete = async (params) => {
    calls.push(params);

    return '{"send":true,"messages":["haha love that"]}';
  };

  expect(game.humanEmojiOnly()).toBe(true);
  expect(game.style_rules()).toContain('JUST an emoji');

  const reply = await game.generate('message');

  expect(reply).toHaveLength(1);
  expect(game.emojiOnly(reply[0])).toBe(true);
  expect(reply[0]).not.toBe('💙');
  expect(calls.length).toBe(3);
  expect(calls[1].messages[0].content).toContain('must be just an emoji');
});

test('emoji detection accepts skin tones and joiners and rejects words', () => {
  const { game } = setup();

  for (const text of ['💙', '😂😂', '👍🏽', '👩‍💻', ' 🔥 ']) expect(game.emojiOnly(text)).toBe(true);

  for (const text of ['lol 😂', 'ok', '?', '']) expect(game.emojiOnly(text)).toBe(false);

  expect(game.normalize('😭')).toBe('😭');
});

test('the bot only pokes a quiet judge after the human has done it first', () => {
  const { game } = setup();

  Object.assign(game, { human_label: 'B', ai_label: 'A' });

  game.messages = [
    { id: '1', from: 'judge', text: 'favorite food', ts: 900 },
    { id: '2', from: 'B', text: 'pizza', ts: 905 },
  ];

  expect(game.humanNudged()).toBe(false);

  game.messages.push({ id: '3', from: 'B', text: 'hello?', ts: 920 });
  expect(game.humanNudged()).toBe(true);

  game.messages = [
    { id: '1', from: 'judge', text: 'favorite food', ts: 900 },
    { id: '2', from: 'B', text: 'hello', ts: 902 },
  ];

  expect(game.humanNudged()).toBe(false);
});
