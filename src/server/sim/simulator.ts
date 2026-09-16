// Operator-only simulator: several matches at once with a scripted judge and a scripted human
// replaying recorded conversations, so the bot can be watched and rerun without people.
// Simulated matches make real provider calls, never count toward the public score,
// and carry the bot's decision trace for the dashboard.
import { Game, type Peer } from '../game';
import { requestCompletion } from '../ai';
import type { Event, Label, RoomView } from '../../shared/protocol';
import type { Store } from '../store';
import sample from './scenarios.sample.json';

export type Turn = { role: 'judge' | 'human'; text: string; after: number };

export type Scenario = { name: string; turns: Turn[]; reason: string };

export type LaneState = {
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
  trace: string[];
  verdict: { by: 'ai-judge' | 'coin'; reason: string } | null;
};

const CPS = 6; // scripted human typing speed, characters per second

class ScriptedPeer implements Peer {
  id = crypto.randomUUID();
  session = crypto.randomUUID();
  ip = '127.0.0.1';
  roomId?: string;
  view: RoomView | null = null;
  errors: string[] = [];
  private waiters: ((v: RoomView) => void)[] = [];

  constructor(readonly game: Game) {}

  send = (event: Event) => {
    if (event.type === 'room') {
      this.view = event.data;

      for (const w of this.waiters.splice(0)) w(event.data);
    }

    if (event.type === 'error') this.errors.push(event.message);
  };

  command(command: unknown) {
    return this.game.run(() => this.game.handle(this, command));
  }

  until(test: (v: RoomView) => boolean, timeout = 130_000) {
    if (this.view && test(this.view)) return Promise.resolve(this.view);

    return new Promise<RoomView>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('timed out waiting for the match')), timeout);
      const check = (v: RoomView) => {
        if (test(v)) {
          clearTimeout(timer);
          ok(v);
        } else this.waiters.push(check);
      };

      this.waiters.push(check);
    });
  }
}

export class Simulator {
  lanes: LaneState[] = [];
  scenarios: Scenario[] = (sample as Scenario[]).slice();
  listeners = new Set<(states: LaneState[]) => void>();
  private running = new Map<
    number,
    { judge: ScriptedPeer; human: ScriptedPeer; cancel: boolean }
  >();

  constructor(
    readonly game: Game,
    readonly store: Store,
    lanes = 5,
  ) {
    this.setLanes(lanes);
    setInterval(() => this.push(), 1000);
  }

  setLanes(count: number) {
    count = Math.max(1, Math.min(12, count));

    while (this.lanes.length > count) {
      this.stop(this.lanes.length - 1);
      this.lanes.pop();
    }

    while (this.lanes.length < count)
      this.lanes.push({
        lane: this.lanes.length,
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
        trace: [],
        verdict: null,
      });

    this.push();
  }

  // An independent model reads the transcript with labels only and picks the bot, with a reason.
  // This is the evaluation: it never sees the mapping, so its verdict measures the bot's output.
  async aiJudge(view: RoomView): Promise<{ choice: Label; reason: string } | null> {
    const transcript = view.messages
      .map((m) => `${m.sender === 'judge' ? 'Judge' : 'Player ' + m.sender}: ${m.text}`)
      .join('\n');
    const params = {
      system:
        'You are judging a Turing-test party game. In this group chat, one of Player A and Player B is a human and the other is an AI trying to pass as human. Read the whole chat, decide which player is the AI, and explain the single strongest tell in one or two sentences. Respond with ONLY a JSON object: {"bot":"A"|"B","reason":"..."}',
      messages: [{ role: 'user', content: transcript }],
      max_tokens: 200,
    };
    const controller = new AbortController();

    try {
      const text = await requestCompletion(params, 20, controller.signal, {
        state: () => {},
        beforeRequest: async () => {
          await this.game.available();
        },
        creditExhausted: () => this.game.ai.reportCreditExhausted?.(),
        failed: () => {},
      });
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? (JSON.parse(match[0]) as { bot?: string; reason?: string }) : null;

      if (parsed?.bot === 'A' || parsed?.bot === 'B')
        return { choice: parsed.bot, reason: String(parsed.reason ?? '').slice(0, 900) };
    } catch {}

    return null;
  }

  async loadScenarios() {
    await this.store.db.query(
      'CREATE TABLE IF NOT EXISTS sim_scenarios(name text PRIMARY KEY, body jsonb NOT NULL)',
    );

    const rows = await this.store.db.query<{ body: Scenario | string }>(
      'SELECT body FROM sim_scenarios',
    );
    // postgres.js re-encodes a string parameter for jsonb; tolerate rows stored that way.
    const stored = rows
      .map((r) => (typeof r.body === 'string' ? (JSON.parse(r.body) as Scenario) : r.body))
      .filter((b) => b && Array.isArray(b.turns));

    this.scenarios = [
      ...stored,
      ...(sample as Scenario[]).filter((s) => !stored.some((x) => x.name === s.name)),
    ];
  }

  async importScenarios(list: Scenario[]) {
    for (const s of list) {
      if (!s.name || !Array.isArray(s.turns)) continue;

      const clean: Scenario = {
        name: String(s.name).slice(0, 40),
        reason: String(s.reason ?? '').slice(0, 200),
        turns: s.turns
          .filter((t) => (t.role === 'judge' || t.role === 'human') && typeof t.text === 'string')
          .slice(0, 60)
          .map((t) => ({
            role: t.role,
            text: t.text.slice(0, 500),
            after: Math.max(0.5, Math.min(60, Number(t.after) || 5)),
          })),
      };

      await this.store.db.query(
        'INSERT INTO sim_scenarios(name,body) VALUES($1,$2::jsonb) ON CONFLICT(name) DO UPDATE SET body=EXCLUDED.body',
        [clean.name, process.env.DATABASE_URL ? clean : JSON.stringify(clean)],
      );
    }

    await this.loadScenarios();
  }

  async deleteScenario(name: string) {
    await this.store.db.query('DELETE FROM sim_scenarios WHERE name=$1', [name]);
    await this.loadScenarios();
  }

  push() {
    for (const l of this.listeners) l(this.lanes);
  }

  stop(index: number) {
    const h = this.running.get(index);

    if (!h) return;

    h.cancel = true;
    void h.judge.command({ type: 'leave' }).catch(() => {});
    void h.human.command({ type: 'leave' }).catch(() => {});
    this.running.delete(index);
  }

  rerunAll() {
    this.lanes.forEach((_, i) => setTimeout(() => void this.run(i), i * 1500));
  }

  async run(index: number, scenarioName?: string) {
    const lane = this.lanes[index];

    if (!lane) return;

    this.stop(index);

    const scenario =
      this.scenarios.find((s) => s.name === scenarioName) ??
      this.scenarios[(index + lane.run) % this.scenarios.length];

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
      trace: [],
    });

    this.push();

    const log = (text: string) => {
      lane.log.push(`${new Date().toISOString().slice(11, 19)} ${text}`);

      if (lane.log.length > 60) lane.log.shift();
    };
    const judge = new ScriptedPeer(this.game),
      human = new ScriptedPeer(this.game);
    const handle = { judge, human, cancel: false };

    this.running.set(index, handle);

    const mirror = () => {
      const v = judge.view;

      if (!v) return;

      lane.phase = v.phase;
      lane.messages = v.messages;
      lane.startedAt = v.startedAt;
      lane.deadline = v.deadline;
      lane.result = v.result;
      lane.note = v.message ?? '';
      this.push();
    };
    const originalSend = judge.send;

    judge.send = (event) => {
      originalSend(event);
      mirror();
    };

    try {
      await this.game.run(() => this.game.connect(judge));
      await this.game.run(() => this.game.connect(human));

      // Create the room directly so it is flagged simulated; then seat the scripted human.
      const m = await this.game.run(() => this.game.newMatch(true));

      m.inviteToken = crypto.randomUUID() + crypto.randomUUID();

      m.trace = (text) => {
        lane.trace.push(`${new Date().toISOString().slice(11, 19)} ${text}`);

        if (lane.trace.length > 200) lane.trace.shift();
      };

      this.game.assign(m, judge, 'judge');
      await this.game.run(() => this.game.persist(m));
      await human.command({ type: 'join', token: m.inviteToken! });
      await judge.command({ type: 'context', name: 'Marc' });

      await human.command({
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
      log(`human is ${lane.humanLabel}; replaying "${scenario.name}"`);
      this.push();

      let lastJudgeAt = 0;

      for (const turn of scenario.turns) {
        if (handle.cancel) return;

        if (['verdict', 'complete', 'abandoned', 'failed'].includes(judge.view?.phase ?? '')) break;

        if (turn.role === 'judge') {
          await this.sleep(turn.after * 1000, handle);

          if (handle.cancel) return;

          await judge
            .command({ type: 'message', text: turn.text })
            .catch((e) => log(`judge send failed: ${e.message}`));

          lastJudgeAt = Date.now();
          log(`judge: ${turn.text}`);
        } else {
          const typing = turn.text.length / CPS;

          await this.sleep(Math.max(0.5, turn.after - typing) * 1000, handle);

          for (let i = 1; i <= turn.text.length; i++) {
            if (handle.cancel) return;

            await human.command({ type: 'draft', text: turn.text.slice(0, i) }).catch(() => {});
            await Bun.sleep(1000 / CPS);
          }

          await human
            .command({ type: 'message', text: turn.text })
            .catch((e) => log(`human send failed: ${e.message}`));

          await human.command({ type: 'draft', text: '' }).catch(() => {});

          log(
            `human: ${turn.text} (${((Date.now() - lastJudgeAt) / 1000).toFixed(1)}s after judge)`,
          );
        }
      }

      await judge.until((v) => ['verdict', 'complete', 'abandoned', 'failed'].includes(v.phase));

      if (judge.view!.phase === 'verdict') {
        log('asking the AI judge for a verdict');

        const decided = await this.aiJudge(judge.view!);
        const choice: Label = decided?.choice ?? (Math.random() < 0.5 ? 'A' : 'B');

        lane.verdict = decided
          ? { by: 'ai-judge', reason: decided.reason }
          : { by: 'coin', reason: 'AI judge unavailable; coin flip' };

        await judge.command({ type: 'verdict', choice, reason: lane.verdict.reason.slice(0, 900) });
        await judge.until((v) => v.phase !== 'verdict', 20_000);
      }

      mirror();
      lane.status = 'done';

      log(
        `finished: ${judge.view!.phase}${judge.errors.length ? ' errors: ' + judge.errors.join(' | ') : ''}`,
      );
    } catch (error) {
      lane.status = 'error';
      lane.note = error instanceof Error ? error.message : String(error);
      log(`error: ${lane.note}`);
    } finally {
      this.push();
    }
  }

  private sleep(ms: number, handle: { cancel: boolean }) {
    return new Promise<void>((ok) => {
      const start = Date.now();
      const tick = () => (handle.cancel || Date.now() - start >= ms ? ok() : setTimeout(tick, 100));

      tick();
    });
  }
}
