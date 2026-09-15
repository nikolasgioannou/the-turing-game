// Build sim scenarios from saved transcripts of real games (the Python prototype's games/*.json).
// Output is private player content: it goes to data/sim-scenarios.json, which stays out of git.
//   bun scripts/sim/extract.ts ~/turing-game/games
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type Saved = {
  game: string;
  human: 'A' | 'B';
  ai: 'A' | 'B';
  vote: { pick: string; reason?: string };
  messages: { from: string; text: string; ts: number }[];
};

export type Turn =
  { role: 'judge'; text: string; after: number } | { role: 'human'; text: string; after: number };

export type Scenario = { name: string; turns: Turn[]; reason: string };

const dir = process.argv[2];

if (!dir) throw new Error('Usage: bun scripts/sim/extract.ts <games dir>');

// Scripted test games from the prototype use these exact lines; keep only real play.
const scripted =
  /^(nm just chilling|interstellar probably|dogs obviously|hot cheetos|hi|hey|fuck|ur mom|blue i guess|144 lol why|H20|hot|my roommate fell|mac and cheese|heights and also|probably pizza honestly|waht is h20|the best scuba|olives they taste|New York City is the best city in the world, it has|it skinda tricky|10 things I hate about you|care)/i;
const scenarios: Scenario[] = [];

for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
  const g = JSON.parse(await readFile(join(dir, file), 'utf8')) as Saved;
  const turns: Turn[] = [];
  let last = g.messages[0]?.ts ?? 0;
  let human = 0;

  for (const m of g.messages) {
    if (m.from !== 'judge' && m.from !== g.human) continue;

    const role = m.from === 'judge' ? 'judge' : 'human';

    if (role === 'human') human++;

    turns.push({ role, text: m.text, after: Math.max(0.5, Math.min(30, m.ts - last)) });
    last = m.ts;
  }

  const scriptedHits = turns.filter((t) => t.role === 'human' && scripted.test(t.text)).length;

  if (human >= 2 && turns.some((t) => t.role === 'judge') && scriptedHits < human / 2)
    scenarios.push({ name: g.game, turns, reason: g.vote?.reason ?? '' });
}

await mkdir('data', { recursive: true });
await writeFile('data/sim-scenarios.json', JSON.stringify(scenarios, null, 2) + '\n');
console.log(`Wrote ${scenarios.length} scenarios to data/sim-scenarios.json`);
