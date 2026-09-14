import {
  commandSchema,
  ended,
  LIMITS,
  type ChatMessage,
  type Event,
  type Label,
  type Phase,
  type Role,
  type RoomView,
} from '../shared/protocol';
import {
  AIError,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  type AI,
  type BotSession,
  type BotState,
} from './ai';
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
  guessTarget?: 'ai';
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
  messages: ChatMessage[];
  startedAt: number | null;
  openingHuman: string | null;
  aiRequests: number;
  rounds?: Round[]; // Historical five-round replays only.
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
  private bots = new Map<string, BotSession>();
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
    // Seats belong to the authenticated browser session, not a transient socket.

    const match = [...this.rooms.values()].find(
      (m) => !ended(m.phase) && this.role(m, peer) !== 'spectator',
    );

    if (match) {
      peer.roomId = match.id;
      peer.send({ type: 'room', data: this.view(match, peer) });
    }

    await this.lobby(peer);
  }

  role(m: Match, p: Peer): Role | 'spectator' {
    return m.humanSession === p.session
      ? 'human'
      : m.judgeSession === p.session
        ? 'judge'
        : 'spectator';
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
    // Preserve old replays without exposing answers that were never revealed.
    const messages =
      m.messages ??
      (m.rounds ?? []).flatMap((r, i) => [
        { id: `legacy-${i}-judge`, sender: 'judge' as const, text: r.question, sentAt: r.askedAt },
        ...(r.revealedAt === null
          ? []
          : [
              {
                id: `legacy-${i}-A`,
                sender: 'A' as const,
                text: m.humanLabel === 'A' ? r.human! : r.ai!,
                sentAt: r.revealedAt,
              },
              {
                id: `legacy-${i}-B`,
                sender: 'B' as const,
                text: m.humanLabel === 'B' ? r.human! : r.ai!,
                sentAt: r.revealedAt,
              },
            ]),
      ]);

    return {
      id: m.id,
      phase: m.phase,
      createdAt: m.createdAt,
      deadline: m.deadline,
      role,
      ownLabel: role === 'human' ? m.humanLabel : null,
      ownOpening: role === 'human' ? (m.openingHuman ?? null) : null,
      messages: messages.map(({ id, sender, text, sentAt }) => ({ id, sender, text, sentAt })),
      startedAt: m.startedAt ?? null,
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
              guessTarget: m.guessTarget ?? 'human',
              humanWon:
                m.guessTarget === 'ai' ? m.choice !== m.humanLabel : m.choice === m.humanLabel,
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
    const [capacity, score] = await Promise.all([
      this.store.availability(this.now()),
      this.store.score(),
    ]);
    const unavailable = this.ai.unavailable?.();
    const availability = unavailable
      ? { ...capacity, available: false, message: unavailable }
      : capacity;
    const rooms = [...this.rooms.values()]
      .filter((m) => !ended(m.phase) && m.phase !== 'waiting')
      .map((m) => ({
        id: m.id,
        phase: m.phase as 'ready' | 'opening' | 'opening_ai' | 'chat' | 'verdict',
        deadline: m.deadline,
        spectators: this.count(m),
        createdAt: m.createdAt,
      }));

    for (const p of peer ? [peer] : this.peers.values())
      p.send({
        type: 'lobby',
        data: { rooms, availability, score, queued: p.queue ?? null },
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
    return (
      [...this.rooms.values()].some((m) => !ended(m.phase) && this.role(m, p) !== 'spectator') ||
      [...this.peers.values()].some(
        (other) =>
          other.id !== p.id &&
          other.session === p.session &&
          (other.queue ||
            (other.roomId &&
              this.rooms.has(other.roomId) &&
              !ended(this.rooms.get(other.roomId)!.phase) &&
              this.role(this.rooms.get(other.roomId)!, other) !== 'spectator')),
      )
    );
  }

  async available() {
    const unavailable = this.ai.unavailable?.();

    if (unavailable) throw new ActionError(unavailable);

    const state = await this.store.availability(this.now());

    if (!state.available) throw new ActionError(state.message!);
  }

  async newMatch() {
    await this.available();

    const id = crypto.randomUUID();

    if (!(await this.store.reserve(id, this.now())))
      throw new ActionError('The daily AI capacity has been reached. Try again tomorrow.');

    const m: Match = {
      id,
      phase: 'waiting',
      guessTarget: 'ai',
      createdAt: this.now(),
      deadline: this.now() + LIMITS.actionMs,
      humanLabel: Math.random() < 0.5 ? 'A' : 'B',
      messages: [],
      startedAt: null,
      openingHuman: null,
      aiRequests: 0,
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
      await this.expire(m);

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
          next.phase = 'ready';
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
        next.phase = 'ready';
        next.deadline = this.now() + LIMITS.actionMs;
        await this.persist(next);

        return;
      }
      case 'home':
      case 'watch': {
        if (
          m &&
          !ended(m.phase) &&
          this.role(m, p) !== 'spectator' &&
          !(c.type === 'watch' && c.id === m.id)
        )
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
          await this.finish(m, 'abandoned', 'A player left. This match was not counted.');

        p.queue = undefined;
        p.roomId = undefined;
        await this.lobby(p);

        return;
    }

    if (c.type === 'draft') {
      if (!m || this.role(m, p) !== 'human')
        throw new ActionError('Only the human contestant can share a draft.');

      if (!['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase)) return;

      const bot = this.bot(m);

      if (c.hints) bot?.send({ type: 'hints', hints: c.hints });

      bot?.send({ type: 'draft', text: c.text });

      return;
    }

    if (!m || ended(m.phase)) throw new ActionError('This match is no longer accepting actions.');

    const role = this.role(m, p);

    if (c.type === 'message') {
      if (role === 'spectator' || !['ready', 'opening', 'chat'].includes(m.phase))
        throw new ActionError('Chat is not accepting messages.');

      if (m.phase === 'ready' && role !== 'judge')
        throw new ActionError('The judge starts the chat.');

      this.bot(m);

      if (m.phase === 'opening') {
        if (role !== 'human') throw new ActionError('Wait for the opening replies.');

        m.openingHuman = c.text;
        m.phase = 'opening_ai';
        m.deadline = this.now() + LIMITS.actionMs;
        this.bot(m)?.send({ type: 'message', role: 'player', text: c.text });
        await this.persist(m);

        return;
      }

      const sender = role === 'judge' ? 'judge' : m.humanLabel;
      const own = m.messages.filter((message) => message.sender === sender);

      if (own.length >= LIMITS.messagesPerPerson)
        throw new ActionError('You have reached the message limit for this chat.');

      if (m.phase === 'ready') {
        m.phase = 'opening';
        m.deadline = this.now() + LIMITS.actionMs;
        m.messages.push({ id: crypto.randomUUID(), sender, text: c.text, sentAt: this.now() });
        this.bot(m)?.send({ type: 'message', role: 'judge', text: c.text });
        await this.persist(m);

        return;
      }

      m.messages.push({ id: crypto.randomUUID(), sender, text: c.text, sentAt: this.now() });

      this.bot(m)?.send({
        type: 'message',
        role: role === 'human' ? 'player' : 'judge',
        text: c.text,
      });

      await this.persist(m);
    } else if (c.type === 'verdict') {
      if (role !== 'judge' || !['chat', 'verdict'].includes(m.phase))
        throw new ActionError('The verdict is not available yet.');

      m.choice = c.choice;
      m.reason = c.reason.trim();
      await this.finish(m, 'complete', null);
    } else if (c.type === 'vote') {
      if (
        role !== 'spectator' ||
        m.humanSession === p.session ||
        m.judgeSession === p.session ||
        !['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase)
      )
        throw new ActionError('Only spectators can submit an audience guess.');

      m.votes[p.session] = c.choice;
      await this.persist(m);
    }
  }

  private bot(m: Match): BotSession | undefined {
    const existing = this.bots.get(m.id);

    if (existing) return existing;

    try {
      const bot = this.ai.start(m.id, m.humanLabel, {
        state: (state) => {
          void this.run(() => this.receiveBot(m, state));
        },
        reserve: (bound) =>
          this.run(async () => {
            if (
              !['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase) ||
              (m.deadline !== null && this.now() >= m.deadline)
            )
              throw new AIError('match_closed');

            try {
              const id = await this.store.beginRequest(
                m.id,
                { model: this.ai.model, promptVersion: PROMPT_VERSION, request: ++m.aiRequests },
                bound,
              );

              return id;
            } catch {
              await this.finish(
                m,
                'failed',
                'AI capacity was exhausted. This match was not counted.',
              );

              throw new AIError('capacity');
            }
          }),
        settle: (id, usage, metadata) =>
          this.run(() => this.store.settleRequest(id, usage, metadata)),
        failed: (error) => {
          void this.run(async () => {
            if (ended(m.phase) || m.phase === 'verdict') return;

            await this.finish(m, 'failed', 'The AI is unavailable. This match was not counted.');

            console.error(
              'Bot unavailable:',
              error instanceof AIError ? error.code : 'worker_error',
            );
          });
        },
      });

      this.bots.set(m.id, bot);

      return bot;
    } catch (error) {
      throw new ActionError(error instanceof AIError ? error.code : 'Could not start the AI.');
    }
  }

  private async receiveBot(m: Match, state: BotState) {
    if (ended(m.phase) || m.phase === 'verdict') return;

    if (m.deadline !== null && this.now() >= m.deadline) {
      await this.expire(m);

      return;
    }

    let changed = false;

    if (state.phase === 'live' && m.phase !== 'chat') {
      m.phase = 'chat';
      m.startedAt = Math.round(state.startedAt! * 1000);
      m.deadline = Math.round(state.endsAt! * 1000);
      changed = true;
    }
    // A submitted opening may reach the worker just after its early attack.
    // Retain it until the worker confirms publication, rather than dropping it.

    if (state.phase === 'live' && m.openingHuman !== null) {
      const held = state.messages.find((message) => message.from === m.humanLabel);

      if (held) {
        m.messages.push({
          id: held.id,
          sender: m.humanLabel,
          text: held.text,
          sentAt: Math.round(held.ts * 1000),
        });

        m.openingHuman = null;
        changed = true;
      }
    }

    for (const message of state.messages) {
      if (
        message.from === 'judge' ||
        message.from === m.humanLabel ||
        m.messages.some((existing) => existing.id === message.id)
      )
        continue;

      m.messages.push({
        id: message.id,
        sender: message.from,
        text: message.text,
        sentAt: Math.round(message.ts * 1000),
      });

      changed = true;
    }

    if (state.phase === 'voting') {
      await this.expire(m);

      return;
    }

    if (changed) await this.persist(m);
  }

  private stopBot(m: Match) {
    this.bots.get(m.id)?.stop();
    this.bots.delete(m.id);
  }

  async finish(m: Match, phase: Phase, message: string | null) {
    m.phase = phase;
    m.message = message;
    m.deadline = null;
    this.stopBot(m);
    await this.store.release(m.id);
    await this.persist(m);
  }

  async disconnect(p: Peer) {
    this.peers.delete(p.id);

    const m = p.roomId ? this.rooms.get(p.roomId) : undefined;
    // Transport loss never changes match state, deadlines or pending AI work.

    if (m) this.broadcast(m);

    await this.lobby();
  }

  async expire(m: Match) {
    if (m.phase === 'chat') {
      m.phase = 'verdict';
      m.deadline = this.now() + LIMITS.actionMs;
      this.stopBot(m);
      await this.store.release(m.id);
      await this.persist(m);
    } else {
      await this.finish(
        m,
        'abandoned',
        m.phase === 'waiting'
          ? 'The invitation expired.'
          : 'Time ran out. This match was not counted.',
      );
    }
  }

  async tick() {
    for (const m of this.rooms.values()) {
      if (!ended(m.phase) && m.deadline !== null && this.now() >= m.deadline) await this.expire(m);

      if (ended(m.phase) && ![...this.peers.values()].some((p) => p.roomId === m.id))
        this.rooms.delete(m.id);
    }

    await this.lobby();
  }
}
