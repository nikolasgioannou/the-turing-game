// Regenerate the pinned conversation-behavior fixtures from the current brain.
// Run deliberately after an intentional prompt or style-rule change, then review the diff:
//   bun scripts/fixtures.ts
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Game } from '../src/server/bot/brain';
import type { Completion } from '../src/server/ai';

const path = 'tests/fixtures/brain-behavior.json';
const fixtures = JSON.parse(await readFile(path, 'utf8'));

for (const fixture of fixtures) {
  let time = 1000;
  const calls: Completion[] = [];
  const game = new Game('test', 'A', {
    now: () => time,
    random: () => fixture.random,
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

  Object.assign(game, structuredClone(fixture.state));

  const expected: Record<string, unknown> = {};

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
    expected[method] = (game as any)[method]();

  expected.normalize = game.normalize(fixture.text);
  expected.add_typo = game.add_typo(fixture.text);
  expected.weird_traits = game.weird_traits(fixture.state.messages.at(-1).text);
  expected.type_time = game.type_time(fixture.text);
  expected.typing_floor = game.typing_floor(fixture.text, 990);
  await game.generate('message');
  expected.promptHash = createHash('sha256').update(calls[0].messages[0].content).digest('hex');
  fixture.expected = expected;
}

await writeFile(path, JSON.stringify(fixtures, null, 2) + '\n');
console.log(`Rewrote ${fixtures.length} fixtures.`);
