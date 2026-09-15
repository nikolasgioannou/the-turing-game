// Simulation dashboard: runs several matches at once against a local server with a scripted
// judge and a scripted human replaying real conversations, so the bot's behavior can be watched
// live and rerun without waiting for people. Development only; never part of the served app.
//
//   bun run sim              # 5 lanes on http://localhost:5175
//   LANES=8 bun run sim
//
// Scenarios come from data/sim-scenarios.json (private, built by scripts/sim/extract.ts) or
// scripts/sim/scenarios.sample.json. Every match makes real OpenRouter calls on your key.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from '../src/shared/protocol';
import type { Event, RoomView, Label } from '../src/shared/protocol';
import type { Scenario } from './sim/extract';

const LANES = Number(process.env.LANES ?? 5);
const PORT = Number(process.env.SIM_APP_PORT ?? 3200);
const DASH = Number(process.env.SIM_PORT ?? 5175);
const APP = `http://localhost:${PORT}`;
const CPS = Number(process.env.SIM_CPS ?? 6); // scripted human typing speed, characters per second

if (!process.env.OPENROUTER_API_KEY) {
  console.error('The simulator makes real model calls; put OPENROUTER_API_KEY in .env.');
  process.exit(1);
}

const scenarios: Scenario[] = JSON.parse(
  await readFile(
    existsSync('data/sim-scenarios.json')
      ? 'data/sim-scenarios.json'
      : 'scripts/sim/scenarios.sample.json',
    'utf8',
  ),
);

// ---------- app server (own database, own generous caps; nothing touches production) ----------
let app: ReturnType<typeof Bun.spawn> | null = null;

async function healthy() {
  try {
    return (await fetch(`${APP}/api/health`)).ok;
  } catch {
    return false;
  }
}

if (!(await healthy())) {
  if (!existsSync('dist/index.html')) {
    const build = Bun.spawn(['bun', 'run', 'build'], { stdio: ['inherit', 'inherit', 'inherit'] });

    if ((await build.exited) !== 0) process.exit(1);
  }

  app = Bun.spawn(['bun', 'src/server/index.ts'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PORT: String(PORT),
      APP_ORIGIN: APP,
      PGLITE_PATH: resolve('data/sim-db'),
      DATABASE_URL: '',
      DAILY_INPUT_TOKEN_CAP: process.env.SIM_INPUT_CAP ?? '30000000',
      DAILY_OUTPUT_TOKEN_CAP: process.env.SIM_OUTPUT_CAP ?? '3000000',
      DAILY_USD_CAP: process.env.SIM_USD_CAP ?? '40',
    },
  });

  for (let i = 0; i < 100 && !(await healthy()); i++) await Bun.sleep(200);

  if (!(await healthy())) {
    console.error('The app server did not start.');
    process.exit(1);
  }
}

// ---------- scripted peers ----------
class Peer {
  ws!: WebSocket;
  view: RoomView | null = null;
  errors: string[] = [];
  waiters: ((v: RoomView) => void)[] = [];

  constructor(readonly name: string) {}

  async connect() {
    const session = crypto.randomUUID();

    this.ws = new WebSocket(`${APP.replace('http', 'ws')}/ws`, {
      headers: { Origin: APP, Cookie: `turing_session=${session}` },
    } as any);

    await new Promise<void>((ok, fail) => {
      this.ws.onopen = () => ok();
      this.ws.onerror = (e) => fail(new Error(`socket failed for ${this.name}: ${e}`));
    });

    this.ws.onmessage = (m) => {
      const event = JSON.parse(String(m.data)) as Event;

      if (event.type === 'room') {
        this.view = event.data;

        for (const w of this.waiters.splice(0)) w(event.data);
      }

      if (event.type === 'error') this.errors.push(event.message);
    };
  }

  send(command: Command) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(command));
  }

  // Resolve once the room view satisfies `test` (checks the current view first).
  until(test: (v: RoomView) => boolean, timeout = 120_000) {
    if (this.view && test(this.view)) return Promise.resolve(this.view);

    return new Promise<RoomView>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error(`${this.name}: timed out waiting`)), timeout);
      const check = (v: RoomView) => {
        if (test(v)) {
          clearTimeout(timer);
          ok(v);
        } else this.waiters.push(check);
      };

      this.waiters.push(check);
    });
  }

  close() {
    try {
      this.send({ type: 'leave' });
      this.ws.close();
    } catch {}
  }
}

// ---------- lanes ----------
type LaneState = {
  lane: number;
  scenario: string;
  status: 'idle' | 'connecting' | 'running' | 'done' | 'error';
  phase: string;
  humanLabel: Label | null;
  messages: { sender: string; text: string; sentAt: number }[];
  startedAt: number | null;
  deadline: number | null;
  result: RoomView['result'];
  note: string;
  run: number;
  log: string[];
};

const lanes: LaneState[] = [];
const running = new Map<number, { judge: Peer; human: Peer; cancel: boolean }>();
const listeners = new Set<(states: LaneState[]) => void>();

function push() {
  for (const l of listeners) l(lanes);
}

function log(lane: LaneState, text: string) {
  lane.log.push(`${new Date().toLocaleTimeString([], { hour12: false })} ${text}`);

  if (lane.log.length > 40) lane.log.shift();
}

async function runLane(index: number, scenarioName?: string) {
  running.get(index)?.judge.close();
  running.get(index)?.human.close();

  if (running.has(index)) running.get(index)!.cancel = true;

  const scenario =
    scenarios.find((s) => s.name === scenarioName) ??
    scenarios[(index + lanes[index].run) % scenarios.length];
  const lane = lanes[index];

  Object.assign(lane, {
    scenario: scenario.name,
    status: 'connecting',
    phase: 'waiting',
    humanLabel: null,
    messages: [],
    startedAt: null,
    deadline: null,
    result: null,
    note: '',
    run: lane.run + 1,
    log: [],
  });

  push();

  const judge = new Peer(`lane ${index} judge`),
    human = new Peer(`lane ${index} human`);
  const handle = { judge, human, cancel: false };

  running.set(index, handle);

  const mirror = () => {
    const v = judge.view;

    if (!v) return;

    lane.phase = v.phase;
    lane.messages = v.messages;
    lane.startedAt = v.startedAt;
    lane.deadline = v.deadline;
    lane.result = v.result;
    lane.note = v.message ?? '';
    push();
  };

  try {
    await judge.connect();
    await human.connect();

    judge.ws.addEventListener('message', mirror);
    judge.send({ type: 'create', role: 'judge' });

    const token = (await judge.until((v) => !!v.inviteToken)).inviteToken!;

    human.send({ type: 'join', token });
    await human.until((v) => v.phase !== 'waiting');
    judge.send({ type: 'context', name: 'Marc' });

    human.send({
      type: 'context',
      name: 'Sam',
      hints: {
        mobile: 'false',
        tz: 'America/New_York',
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        day: new Date().toLocaleDateString([], { weekday: 'long' }),
        platform: 'Mac',
      },
    });

    await human.until((v) => !!v.ownLabel);
    lane.humanLabel = human.view!.ownLabel;
    lane.status = 'running';
    log(lane, `human is ${lane.humanLabel}; replaying "${scenario.name}"`);
    push();

    let lastJudgeAt = 0;

    for (const turn of scenario.turns) {
      if (handle.cancel) return;

      const view = judge.view!;

      if (['verdict', 'complete', 'abandoned', 'failed'].includes(view.phase)) break;

      if (turn.role === 'judge') {
        await sleepUnless(turn.after * 1000, handle);
        judge.send({ type: 'message', text: turn.text });
        lastJudgeAt = Date.now();
        log(lane, `judge: ${turn.text}`);
      } else {
        // reply after the recorded delay, typing the text live so the bot sees the draft
        const typing = turn.text.length / CPS;
        const wait = Math.max(0.5, turn.after - typing) * 1000;

        await sleepUnless(wait, handle);

        for (let i = 1; i <= turn.text.length; i++) {
          if (handle.cancel) return;

          human.send({ type: 'draft', text: turn.text.slice(0, i) });
          await Bun.sleep(1000 / CPS);
        }

        human.send({ type: 'message', text: turn.text });
        human.send({ type: 'draft', text: '' });

        log(
          lane,
          `human: ${turn.text} (${((Date.now() - lastJudgeAt) / 1000).toFixed(1)}s after judge)`,
        );
      }
    }

    // wait for the clock, then let the judge pick the bot with the recorded reasoning
    await judge.until((v) => ['verdict', 'complete', 'abandoned', 'failed'].includes(v.phase));

    if (judge.view!.phase === 'verdict') {
      const bot: Label = lane.humanLabel === 'A' ? 'B' : 'A';

      judge.send({ type: 'verdict', choice: bot, reason: scenario.reason || 'sim' });
      await judge.until((v) => v.phase !== 'verdict', 20_000);
    }

    mirror();
    lane.status = 'done';

    log(
      lane,
      `finished: ${judge.view!.phase}${judge.errors.length ? ' errors: ' + judge.errors.join(' | ') : ''}`,
    );
  } catch (error) {
    lane.status = 'error';
    lane.note = error instanceof Error ? error.message : String(error);
    log(lane, `error: ${lane.note}`);
  } finally {
    push();
  }
}

function sleepUnless(ms: number, handle: { cancel: boolean }) {
  return new Promise<void>((ok) => {
    const start = Date.now();
    const tick = () => (handle.cancel || Date.now() - start >= ms ? ok() : setTimeout(tick, 100));

    tick();
  });
}

for (let i = 0; i < LANES; i++)
  lanes.push({
    lane: i,
    scenario: '',
    status: 'idle',
    phase: '',
    humanLabel: null,
    messages: [],
    startedAt: null,
    deadline: null,
    result: null,
    note: '',
    run: 0,
    log: [],
  });

// ---------- dashboard ----------
const page = await readFile(resolve(import.meta.dir, 'sim/dashboard.html'), 'utf8');

Bun.serve({
  port: DASH,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/')
      return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    if (url.pathname === '/scenarios')
      return Response.json(scenarios.map((s) => ({ name: s.name, turns: s.turns.length })));

    if (url.pathname === '/events') {
      let send: ((states: LaneState[]) => void) | null = null;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          send = (states) => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ states, now: Date.now() })}\n\n`),
              );
            } catch {}
          };

          listeners.add(send);
          send(lanes);
        },
        cancel() {
          if (send) listeners.delete(send);
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/rerun' && req.method === 'POST') {
      const lane = Number(url.searchParams.get('lane'));
      const scenario = url.searchParams.get('scenario') ?? undefined;

      if (Number.isInteger(lane) && lanes[lane]) void runLane(lane, scenario);

      return Response.json({ ok: true });
    }

    if (url.pathname === '/rerun-all' && req.method === 'POST') {
      lanes.forEach((_, i) => setTimeout(() => void runLane(i), i * 1500));

      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  },
});

setInterval(push, 1000);

console.log(
  `Simulation dashboard: http://localhost:${DASH}  (app on ${APP}, ${scenarios.length} scenarios, ${LANES} lanes)`,
);

lanes.forEach((_, i) => setTimeout(() => void runLane(i), i * 1500));

process.on('SIGINT', () => {
  for (const h of running.values()) {
    h.judge.close();
    h.human.close();
  }

  app?.kill();
  process.exit(0);
});
