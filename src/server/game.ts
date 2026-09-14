import { commandSchema } from '../shared/commands';
import {
  ended,
  normalizeName,
  LIMITS,
  type ChatMessage,
  type Event,
  type Label,
  type Phase,
  type Role,
  type QueuePreference,
  type RoomView,
} from '../shared/protocol';
import { AIError, PROMPT_VERSION, type AI, type BotSession, type BotState } from './ai';
import { Store } from './store';

export interface Peer {
  id: string;
  session: string;
  ip?: string;
  send: (event: Event) => void;
  roomId?: string;
  queue?: QueuePreference;
}

export type Match = {
  names?: { judge?: string; player?: string };
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
  humanMessageCount?: number;
  aiRequests: number;
  choice: Label | null;
  reason: string;
  message: string | null;
};

export class ActionError extends Error {}

export class Game {
  peers = new Map<string, Peer>();
  rooms = new Map<string, Match>();
  private bots = new Map<string, BotSession>();
  private score?: ReturnType<Store['score']>;
  private contexts = new Map<string, Record<string, string>>();
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
      (m) => !ended(m.phase) && this.role(m, peer) !== null,
    );

    if (match) {
      peer.roomId = match.id;
      peer.send({ type: 'room', data: this.view(match, peer) });
    }

    await this.lobby(peer);
  }

  role(m: Match, p: Peer): Role | null {
    return m.humanSession === p.session ? 'human' : m.judgeSession === p.session ? 'judge' : null;
  }

  view(m: Match, p: Peer): RoomView {
    const role = this.role(m, p);

    if (!role) throw new ActionError('Only participants can access this match.');

    return {
      id: m.id,
      phase: m.phase,
      createdAt: m.createdAt,
      deadline: m.deadline,
      role,
      ownLabel: role === 'human' ? m.humanLabel : null,
      ownOpening: role === 'human' ? (m.openingHuman ?? null) : null,
      contextReady: !!(m.names?.judge && m.names?.player),
      judgeName: m.names?.judge ?? '',
      ownName:
        role === 'human' ? (m.names?.player ?? '') : role === 'judge' ? (m.names?.judge ?? '') : '',
      messages: m.messages.map(({ id, sender, text, sentAt }) => ({ id, sender, text, sentAt })),
      startedAt: m.startedAt ?? null,
      ...(role !== null && m.phase === 'waiting' ? { inviteToken: m.inviteToken } : {}),
      openRole: m.phase === 'waiting' ? (m.humanPeer ? 'judge' : 'human') : null,
      result:
        m.phase === 'complete'
          ? {
              humanLabel: m.humanLabel,
              choice: m.choice!,
              reason: m.reason,
              humanWon: m.choice !== m.humanLabel,
            }
          : null,
      message: m.message,
    };
  }

  async lobby(peer?: Peer) {
    const [capacity, score] = await Promise.all([
      this.store.availability(this.now()),
      (this.score ??= this.store.score().catch((error) => {
        this.score = undefined;

        throw error;
      })),
    ]);
    const unavailable = this.ai.unavailable?.();
    const availability = unavailable
      ? { ...capacity, available: false, message: unavailable }
      : capacity;

    for (const p of peer ? [peer] : this.peers.values())
      p.send({
        type: 'lobby',
        data: { availability, score, queued: p.queue ?? null },
      });
  }

  broadcast(m: Match) {
    for (const p of this.peers.values())
      if (p.roomId === m.id && this.role(m, p)) p.send({ type: 'room', data: this.view(m, p) });
  }

  async persist(m: Match) {
    if (m.phase === 'complete') await this.store.saveOutcome(m.id, m.choice === m.humanLabel);

    if (ended(m.phase)) this.score = undefined;

    this.broadcast(m);
    await this.lobby();
  }

  activeSession(p: Peer) {
    return (
      [...this.rooms.values()].some((m) => !ended(m.phase) && this.role(m, p) !== null) ||
      [...this.peers.values()].some(
        (other) =>
          other.id !== p.id &&
          other.session === p.session &&
          (other.queue ||
            (other.roomId &&
              this.rooms.has(other.roomId) &&
              !ended(this.rooms.get(other.roomId)!.phase) &&
              this.role(this.rooms.get(other.roomId)!, other) !== null)),
      )
    );
  }

  async available() {
    const unavailable = this.ai.unavailable?.();

    if (unavailable) throw new ActionError(unavailable);

    const state = await this.store.availability(this.now());

    if (!state.available) throw new ActionError(state.message!);
  }

  // Provider failures that mean every further request would be billed for nothing.
  static readonly CREDENTIAL_FAILURE = /openrouter_(401|402|403)/;
  static readonly MATCHES_PER_IP_PER_HOUR = 6;
  static readonly BREAKER_FAILURES = 3;
  static readonly BREAKER_WINDOW_MS = 10 * 60_000;
  static readonly BREAKER_PAUSE_MS = 10 * 60_000;
  static readonly CREDENTIAL_PAUSE_MS = 30 * 60_000;

  matchStarts = new Map<string, number[]>();
  providerFailures: number[] = [];

  // Bound automated match creation: one network cannot burn the day's capacity alone.
  admitCreators(creators: Peer[]) {
    const now = this.now();

    for (const p of creators) {
      if (!p.ip) continue;

      const recent = (this.matchStarts.get(p.ip) ?? []).filter((t) => now - t < 60 * 60_000);

      if (recent.length >= Game.MATCHES_PER_IP_PER_HOUR)
        throw new ActionError(
          'Too many games from your network in the last hour. Try again later.',
        );

      this.matchStarts.set(p.ip, recent);
    }

    for (const p of creators) if (p.ip) this.matchStarts.get(p.ip)!.push(now);
  }

  // Stop admitting matches when the provider is rejecting us; every retry would be wasted spend.
  async providerFailed(error: unknown) {
    const now = this.now();
    const code = error instanceof AIError ? error.code : '';

    if (Game.CREDENTIAL_FAILURE.test(code)) {
      await this.store.pauseAI(
        'The AI provider rejected requests (credentials or credit). AI matches are paused; an operator has been notified.',
        now + Game.CREDENTIAL_PAUSE_MS,
      );

      console.error('AI admission paused: provider credential/credit failure', code);
    } else {
      this.providerFailures = this.providerFailures.filter((t) => now - t < Game.BREAKER_WINDOW_MS);
      this.providerFailures.push(now);

      if (this.providerFailures.length >= Game.BREAKER_FAILURES) {
        this.providerFailures = [];

        await this.store.pauseAI(
          'The AI provider is failing repeatedly. AI matches are paused for a few minutes.',
          now + Game.BREAKER_PAUSE_MS,
        );

        console.error('AI admission paused: repeated provider failures');
      }
    }

    await this.lobby();
  }

  async newMatch(creators: Peer[] = []) {
    await this.available();
    this.admitCreators(creators);

    const id = crypto.randomUUID();

    if (!(await this.store.reserve(id, this.now())))
      throw new ActionError('The daily AI capacity has been reached. Try again tomorrow.');

    const m: Match = {
      id,
      phase: 'waiting',
      createdAt: this.now(),
      deadline: this.now() + LIMITS.actionMs,
      humanLabel: Math.random() < 0.5 ? 'A' : 'B',
      messages: [],
      startedAt: null,
      openingHuman: null,
      humanMessageCount: 0,
      aiRequests: 0,
      choice: null,
      reason: '',
      message: null,
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
      if (p.queue || (m && !ended(m.phase) && this.role(m, p) !== null) || this.activeSession(p))
        throw new ActionError('You already have an active seat or are finding a match.');

      await this.available();
    }

    switch (c.type) {
      case 'queue': {
        const other = [...this.peers.values()].find(
          (x) =>
            x.queue &&
            (x.queue === 'either' || c.role === 'either' || x.queue !== c.role) &&
            x.session !== p.session,
        );

        if (other) {
          const next = await this.newMatch([p, other]);

          const role: Role =
            c.role !== 'either'
              ? c.role
              : other.queue === 'human'
                ? 'judge'
                : other.queue === 'judge'
                  ? 'human'
                  : Math.random() < 0.5
                    ? 'human'
                    : 'judge';

          this.assign(next, p, role);
          this.assign(next, other, role === 'human' ? 'judge' : 'human');
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
        const next = await this.newMatch([p]);

        next.inviteToken = crypto.randomUUID() + crypto.randomUUID();

        this.assign(
          next,
          p,
          c.role === 'either' ? (Math.random() < 0.5 ? 'human' : 'judge') : c.role,
        );

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
      case 'home': {
        if (m && !ended(m.phase) && this.role(m, p))
          throw new ActionError('Leave your match before opening another page.');

        p.queue = undefined;
        p.roomId = undefined;
        await this.lobby(p);

        return;
      }
      case 'leave':
        if (m && !ended(m.phase) && this.role(m, p) !== null)
          await this.finish(m, 'abandoned', 'A player left. This match was not counted.');

        p.queue = undefined;
        p.roomId = undefined;
        await this.lobby(p);

        return;
    }

    if (c.type === 'context') {
      if (
        !m ||
        !['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase) ||
        this.role(m, p) === null
      )
        throw new ActionError('Only seated players can set their context.');

      const role = this.role(m, p) === 'human' ? 'player' : 'judge';
      const name = normalizeName(c.name);

      if (!name) throw new ActionError('Enter a first name using letters or numbers.');

      m.names ??= {};

      if (name) m.names[role] = name;

      if (role === 'player' && c.hints) this.contexts.set(m.id, c.hints);

      this.bots.get(m.id)?.send({
        type: 'context',
        role,
        name,
        ...(role === 'player' && c.hints ? { hints: c.hints } : {}),
      });

      await this.persist(m);

      return;
    }

    if (c.type === 'draft') {
      if (!m || this.role(m, p) !== 'human')
        throw new ActionError('Only the human contestant can share a draft.');

      if (!['opening', 'opening_ai', 'chat'].includes(m.phase)) return;

      const bot = this.bot(m);

      bot?.send({ type: 'draft', text: c.text });

      return;
    }

    if (!m || ended(m.phase)) throw new ActionError('This match is no longer accepting actions.');

    const role = this.role(m, p);

    if (c.type === 'message') {
      if (!(m.names?.judge && m.names?.player))
        throw new ActionError('Waiting for both players to enter their names.');

      if (role === null || !['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase))
        throw new ActionError('Chat is not accepting messages.');

      if (m.phase === 'ready' && role !== 'judge')
        throw new ActionError('The judge starts the chat.');

      this.bot(m);

      if (role === 'human') {
        const sent =
          m.humanMessageCount ??
          m.messages.filter((message) => message.sender === m.humanLabel).length +
            (m.openingHuman ? 1 : 0);

        if (sent >= LIMITS.messagesPerPerson)
          throw new ActionError('You have reached the message limit for this chat.');

        m.humanMessageCount = sent + 1;
      }

      if (
        role === 'human' &&
        (['opening', 'opening_ai'].includes(m.phase) || m.openingHuman !== null)
      ) {
        m.openingHuman = c.text;

        if (m.phase !== 'chat') m.phase = 'opening_ai';

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

            await this.providerFailed(error);
          });
        },
      });

      this.bots.set(m.id, bot);

      for (const role of ['judge', 'player'] as const) {
        const name = m.names?.[role];

        if (name)
          bot.send({
            type: 'context',
            role,
            name,
            ...(role === 'player' && this.contexts.has(m.id)
              ? { hints: this.contexts.get(m.id)! }
              : {}),
          });
      }

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
    // The worker publishes held opening messages, including multiple submissions,
    // in its original order. Live human messages are already published by Bun.

    const publishedHumans = m.messages.filter((message) => message.sender === m.humanLabel).length;
    let seenHumans = 0;
    const knownIds = new Set(m.messages.map((message) => message.id));

    for (const message of state.messages) {
      if (message.from === 'judge') continue;

      if (message.from === m.humanLabel && seenHumans++ < publishedHumans) continue;

      if (knownIds.has(message.id)) continue;

      knownIds.add(message.id);

      m.messages.push({
        id: message.id,
        sender: message.from,
        text: message.text,
        sentAt: Math.round(message.ts * 1000),
      });

      changed = true;
    }

    if (
      state.phase === 'live' &&
      m.openingHuman !== null &&
      seenHumans >= (m.humanMessageCount ?? 1)
    ) {
      m.openingHuman = null;
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
    this.contexts.delete(m.id);
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
