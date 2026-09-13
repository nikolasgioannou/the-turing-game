import {
  commandSchema,
  ended,
  LIMITS,
  type Command,
  type Event,
  type Label,
  type Phase,
  type Role,
  type RoomView,
} from '../shared/protocol';
import { AIError, PROMPT_VERSION, SYSTEM_PROMPT, type AI, type AIInput } from './ai';
import { Store } from './store';
export interface Peer {
  id: string;
  session: string;
  send: (event: Event) => void;
  roomId?: string;
  queue?: Role;
}
type Round = {
  question: string;
  askedAt: number;
  human: string | null;
  ai: string | null;
  revealedAt: number | null;
};
export type Match = {
  id: string;
  phase: Phase;
  createdAt: number;
  deadline: number | null;
  humanLabel: Label;
  humanPeer?: string;
  judgePeer?: string;
  humanSession?: string;
  judgeSession?: string;
  inviteToken?: string;
  rounds: Round[];
  votes: Record<string, Label>;
  choice: Label | null;
  reason: string;
  message: string | null;
  model: string;
  promptVersion: string;
  systemPrompt: string;
};
export class ActionError extends Error {}
export class Game {
  peers = new Map<string, Peer>();
  rooms = new Map<string, Match>();
  controllers = new Map<string, AbortController>();
  private serial: Promise<unknown> = Promise.resolve();
  constructor(
    public store: Store,
    public ai: AI,
    public now = () => Date.now(),
  ) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.serial.then(fn);
    this.serial = next.catch((e) =>
      console.error('Game operation failed', e instanceof Error ? e.message : 'unknown'),
    );
    return next;
  }
  async connect(peer: Peer) {
    this.peers.set(peer.id, peer);
    await this.lobby(peer);
  }
  role(m: Match, p: Peer): Role | 'spectator' {
    return m.humanPeer === p.id ? 'human' : m.judgePeer === p.id ? 'judge' : 'spectator';
  }
  count(m: Match) {
    return new Set(
      [...this.peers.values()]
        .filter((p) => p.roomId === m.id && this.role(m, p) === 'spectator')
        .map((p) => p.session),
    ).size;
  }
  view(m: Match, p?: Peer): RoomView {
    const role = p ? this.role(m, p) : 'spectator';
    const answers = (r: Round) =>
      r.revealedAt !== null
        ? ({ [m.humanLabel]: r.human!, [m.humanLabel === 'A' ? 'B' : 'A']: r.ai! } as Record<
            Label,
            string
          >)
        : null;
    return {
      id: m.id,
      phase: m.phase,
      createdAt: m.createdAt,
      deadline: m.deadline,
      role,
      ownLabel: role === 'human' ? m.humanLabel : null,
      ownAnswer: role === 'human' ? (m.rounds.at(-1)?.human ?? null) : null,
      rounds: m.rounds.map((r) => ({
        question: r.question,
        askedAt: r.askedAt,
        answers: answers(r),
        revealedAt: r.revealedAt,
      })),
      ...(role !== 'spectator' && m.phase === 'waiting' ? { inviteToken: m.inviteToken } : {}),
      openRole: m.phase === 'waiting' ? (m.humanPeer ? 'judge' : 'human') : null,
      spectatorCount: this.count(m),
      vote: p ? (m.votes[p.session] ?? null) : null,
      result:
        m.phase === 'complete'
          ? {
              humanLabel: m.humanLabel,
              choice: m.choice!,
              reason: m.reason,
              humanWon: m.choice === m.humanLabel,
              votes: {
                A: Object.values(m.votes).filter((v) => v === 'A').length,
                B: Object.values(m.votes).filter((v) => v === 'B').length,
              },
            }
          : null,
      message: m.message,
    };
  }
  async lobby(peer?: Peer) {
    const availability = await this.store.availability(this.now());
    const rooms = [...this.rooms.values()]
      .filter((m) => !ended(m.phase) && m.phase !== 'waiting')
      .map((m) => ({
        id: m.id,
        round: Math.max(1, m.rounds.length),
        spectators: this.count(m),
        createdAt: m.createdAt,
      }));
    for (const p of peer ? [peer] : this.peers.values())
      p.send({
        type: 'lobby',
        data: { rooms, availability, queued: p.queue ?? null, mock: this.ai.mock },
      });
  }
  broadcast(m: Match) {
    for (const p of this.peers.values())
      if (p.roomId === m.id) p.send({ type: 'room', data: this.view(m, p) });
  }
  async persist(m: Match) {
    await this.store.save(m.id, m);
    this.broadcast(m);
    await this.lobby();
  }
  activeSession(p: Peer) {
    return [...this.peers.values()].some(
      (other) =>
        other.id !== p.id &&
        other.session === p.session &&
        (other.queue ||
          (other.roomId &&
            this.rooms.has(other.roomId) &&
            !ended(this.rooms.get(other.roomId)!.phase) &&
            this.role(this.rooms.get(other.roomId)!, other) !== 'spectator')),
    );
  }
  async available() {
    const state = await this.store.availability(this.now());
    if (!state.available) throw new ActionError(state.message!);
  }
  async newMatch() {
    await this.available();
    const id = crypto.randomUUID();
    if (!(await this.store.reserve(id, this.now())))
      throw new ActionError('Today’s AI capacity has been reached. Try again tomorrow.');
    const m: Match = {
      id,
      phase: 'waiting',
      createdAt: this.now(),
      deadline: this.now() + LIMITS.actionMs,
      humanLabel: Math.random() < 0.5 ? 'A' : 'B',
      rounds: [],
      votes: {},
      choice: null,
      reason: '',
      message: null,
      model: this.ai.model,
      promptVersion: PROMPT_VERSION,
      systemPrompt: SYSTEM_PROMPT,
    };
    this.rooms.set(id, m);
    return m;
  }
  assign(m: Match, p: Peer, role: Role) {
    if (role === 'human') {
      m.humanPeer = p.id;
      m.humanSession = p.session;
    } else {
      m.judgePeer = p.id;
      m.judgeSession = p.session;
    }
    p.roomId = m.id;
    p.queue = undefined;
  }
  async handle(p: Peer, raw: unknown) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success)
      throw new ActionError('That action is invalid. Check the text limit and try again.');
    const c = parsed.data;
    if (c.type === 'ping') {
      p.send({ type: 'pong' });
      return;
    }
    let m = p.roomId ? this.rooms.get(p.roomId) : undefined;
    if (m && !ended(m.phase) && m.deadline !== null && this.now() >= m.deadline)
      await this.finish(m, 'abandoned', 'Time ran out. This match wasn’t counted.');
    if (['queue', 'create', 'join'].includes(c.type)) {
      if (
        p.queue ||
        (m && !ended(m.phase) && this.role(m, p) !== 'spectator') ||
        this.activeSession(p)
      )
        throw new ActionError('You already have an active seat or are finding a match.');
      await this.available();
    }
    switch (c.type) {
      case 'queue': {
        const other = [...this.peers.values()].find(
          (x) => x.queue && x.queue !== c.role && x.session !== p.session,
        );
        if (other) {
          const next = await this.newMatch();
          this.assign(next, p, c.role);
          this.assign(next, other, other.queue!);
          next.phase = 'question';
          await this.persist(next);
        } else {
          p.roomId = undefined;
          p.queue = c.role;
          await this.lobby();
        }
        return;
      }
      case 'cancel':
        p.queue = undefined;
        await this.lobby(p);
        return;
      case 'create': {
        const next = await this.newMatch();
        next.inviteToken = crypto.randomUUID() + crypto.randomUUID();
        this.assign(next, p, c.role);
        await this.persist(next);
        return;
      }
      case 'join': {
        const next = [...this.rooms.values()].find(
          (r) => r.inviteToken === c.token && r.phase === 'waiting',
        );
        if (!next || next.deadline! <= this.now())
          throw new ActionError('This invitation has expired or the seat is already taken.');
        if (next.humanSession === p.session || next.judgeSession === p.session)
          throw new ActionError('Open the invitation on another device or browser profile.');
        this.assign(next, p, next.humanPeer ? 'judge' : 'human');
        next.phase = 'question';
        next.deadline = this.now() + LIMITS.actionMs;
        await this.persist(next);
        return;
      }
      case 'home':
      case 'watch': {
        if (m && !ended(m.phase) && this.role(m, p) !== 'spectator')
          throw new ActionError('Leave your match before opening another page.');
        p.queue = undefined;
        if (c.type === 'home') {
          p.roomId = undefined;
          await this.lobby(p);
          return;
        }
        let target = this.rooms.get(c.id);
        if (!target) target = (await this.store.load<Match>(c.id)) ?? undefined;
        if (!target) throw new ActionError('This match could not be found.');
        p.roomId = target.id;
        p.send({ type: 'room', data: this.view(target, p) });
        if (this.rooms.has(target.id)) this.broadcast(target);
        return;
      }
      case 'leave':
        if (m && !ended(m.phase) && this.role(m, p) !== 'spectator')
          await this.finish(m, 'abandoned', 'A player left. This match wasn’t counted.');
        p.queue = undefined;
        p.roomId = undefined;
        await this.lobby(p);
        return;
    }
    if (!m || ended(m.phase)) throw new ActionError('This match is no longer accepting actions.');
    const role = this.role(m, p);
    if (c.type === 'question') {
      if (role !== 'judge' || m.phase !== 'question')
        throw new ActionError('It is not your turn to ask a question.');
      m.rounds.push({
        question: c.text,
        askedAt: this.now(),
        human: null,
        ai: null,
        revealedAt: null,
      });
      m.phase = 'answer';
      m.deadline = this.now() + LIMITS.actionMs;
      await this.persist(m);
    } else if (c.type === 'answer') {
      if (role !== 'human' || m.phase !== 'answer')
        throw new ActionError('It is not your turn to answer.');
      m.rounds.at(-1)!.human = c.text;
      m.phase = 'generating';
      m.deadline = null;
      await this.persist(m);
      await this.generate(m);
    } else if (c.type === 'verdict') {
      if (role !== 'judge' || m.phase !== 'verdict')
        throw new ActionError('The verdict is not available yet.');
      m.choice = c.choice;
      m.reason = c.reason.trim();
      await this.finish(m, 'complete', null);
    } else if (c.type === 'vote') {
      if (
        role !== 'spectator' ||
        m.humanSession === p.session ||
        m.judgeSession === p.session ||
        m.phase === 'waiting'
      )
        throw new ActionError('Only spectators can submit an audience guess.');
      m.votes[p.session] = c.choice;
      await this.persist(m);
    }
  }
  async generate(m: Match) {
    const current = m.rounds.at(-1)!;
    const input: AIInput = {
      label: m.humanLabel === 'A' ? 'B' : 'A',
      question: current.question,
      humanAnswer: current.human!,
      matchId: m.id,
      history: m.rounds.slice(0, -1).map((r) => ({
        question: r.question,
        answers: {
          [m.humanLabel]: r.human!,
          [m.humanLabel === 'A' ? 'B' : 'A']: r.ai!,
        } as Record<Label, string>,
      })),
    };
    let requestId: string;
    try {
      requestId = await this.store.beginRequest(m.id, {
        model: this.ai.model,
        promptVersion: PROMPT_VERSION,
        round: m.rounds.length,
      });
    } catch {
      await this.finish(m, 'failed', 'The AI could not start. This match wasn’t counted.');
      return;
    }
    const controller = new AbortController();
    this.controllers.set(m.id, controller);
    const timer = setTimeout(() => controller.abort(), 30_000);
    // Generation runs outside the serialized command queue, allowing disconnects and other games.
    void this.ai
      .complete(input, controller.signal)
      .then((result) =>
        this.run(async () => {
          await this.store.settleRequest(requestId, result.usage, {
            provider: result.provider,
            model: result.model,
            requestId: result.requestId,
            status: 'ok',
          });
          if (ended(m.phase)) return;
          current.ai = result.text;
          current.revealedAt = this.now();
          m.phase = m.rounds.length === 5 ? 'verdict' : 'question';
          m.deadline = this.now() + LIMITS.actionMs;
          await this.persist(m);
        }),
      )
      .catch((error) =>
        this.run(async () => {
          await this.store.settleRequest(requestId, null, {
            status: 'failed',
            code: error instanceof AIError ? error.code : 'unknown',
          });
          if (ended(m.phase)) return;
          await this.store.pause(
            'The AI is temporarily unavailable. Please try again later.',
            error instanceof AIError ? error.retryMs : 60_000,
          );
          await this.finish(
            m,
            'failed',
            'The AI is temporarily unavailable. This match wasn’t counted.',
          );
        }),
      )
      .finally(() => {
        clearTimeout(timer);
        this.controllers.delete(m.id);
      })
      .catch(() => {
        // A storage failure must not leave a live room waiting indefinitely.
        m.phase = 'failed';
        m.deadline = null;
        m.message = 'The game service is unavailable. This match wasn’t counted.';
        this.broadcast(m);
        console.error(
          'Could not persist AI finalization; startup recovery will retain the conservative charge.',
        );
      });
  }
  async finish(m: Match, phase: Phase, message: string | null) {
    m.phase = phase;
    m.message = message;
    m.deadline = null;
    this.controllers.get(m.id)?.abort();
    await this.store.release(m.id);
    await this.persist(m);
  }
  async disconnect(p: Peer) {
    this.peers.delete(p.id);
    const m = p.roomId ? this.rooms.get(p.roomId) : undefined;
    if (m && !ended(m.phase) && this.role(m, p) !== 'spectator')
      await this.finish(m, 'abandoned', 'A player disconnected. This match wasn’t counted.');
    else if (m) this.broadcast(m);
    await this.lobby();
  }
  async tick() {
    for (const m of this.rooms.values()) {
      if (!ended(m.phase) && m.deadline !== null && this.now() >= m.deadline)
        await this.finish(
          m,
          'abandoned',
          m.phase === 'waiting'
            ? 'The invitation expired.'
            : 'Time ran out. This match wasn’t counted.',
        );
      if (ended(m.phase) && ![...this.peers.values()].some((p) => p.roomId === m.id))
        this.rooms.delete(m.id);
    }
    await this.lobby();
  }
}
