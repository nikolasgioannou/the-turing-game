import { BUSY_MESSAGE } from './capacity';
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
import { AIError, type AI, type BotSession, type BotState } from './ai';
import { CAPACITY_INTERRUPTED } from './provider-availability';
import { Store } from './store';

export interface Peer {
  id: string;
  session: string;
  send: (event: Event) => void;
  roomId?: string;
  queue?: QueuePreference;
  queueOrder?: number;
}

export type Match = {
  rematch?: Partial<Record<Role, QueuePreference>>;
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
  simulated?: boolean;
  trace?: (text: string) => void;
  messages: ChatMessage[];
  startedAt: number | null;
  openingHuman: string | null;
  humanMessageCount?: number;
  choice: Label | null;
  reason: string;
  message: string | null;
};

export class ActionError extends Error {}

export class Game {
  peers = new Map<string, Peer>();
  rooms = new Map<string, Match>();
  private queueSequence = 0;
  private bots = new Map<string, BotSession>();
  private score?: ReturnType<Store['score']>;
  private contexts = new Map<string, Record<string, string>>();
  private serial: Promise<unknown> = Promise.resolve();

  constructor(
    public store: Store,
    public ai: AI,
    public now = () => Date.now(),
    public readonly maxActiveGames = 20,
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
      matchKind: m.inviteToken ? 'friend' : 'public',
      rematch:
        ended(m.phase) && m.inviteToken
          ? {
              own: m.rematch?.[role] ?? null,
              other: m.rematch?.[role === 'human' ? 'judge' : 'human'] ?? null,
              available: !!this.rematchPeer(m, p),
            }
          : null,
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
    const score = await (this.score ??= this.store.score().catch((error) => {
      this.score = undefined;

      throw error;
    }));
    const unavailable = this.ai.unavailable?.();
    const availability = {
      available: !unavailable,
      message: unavailable ?? null,
      ...(unavailable && this.ai.capacityResetsAt?.()
        ? { resetsAt: this.ai.capacityResetsAt() }
        : {}),
    };

    for (const p of peer ? [peer] : this.peers.values())
      p.send({
        type: 'lobby',
        data: { availability, score, queued: p.queue ?? null, atCapacity: this.atCapacity() },
      });
  }

  broadcast(m: Match) {
    for (const p of this.peers.values())
      if (p.roomId === m.id && this.role(m, p)) p.send({ type: 'room', data: this.view(m, p) });
  }

  async persist(m: Match) {
    // Simulated matches never touch the public score.
    if (m.phase === 'complete' && !m.simulated)
      await this.store.saveOutcome(m.id, m.choice === m.humanLabel);

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
    await this.ai.refreshAvailability?.();

    const unavailable = this.ai.unavailable?.();

    if (unavailable) throw new ActionError(unavailable);
  }

  atCapacity() {
    return [...this.rooms.values()].filter((m) => !ended(m.phase)).length >= this.maxActiveGames;
  }

  async matchQueued() {
    while (!this.atCapacity() && !this.ai.unavailable?.()) {
      const waiting = [...this.peers.values()]
        .filter((p) => p.queue)
        .sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0));
      let pair: [Peer, Peer] | undefined;

      for (const first of waiting) {
        const second = waiting.find(
          (p) =>
            p !== first &&
            p.session !== first.session &&
            (p.queue === 'either' || first.queue === 'either' || p.queue !== first.queue),
        );

        if (second) {
          pair = [first, second];
          break;
        }
      }

      if (!pair) return;

      const [other, p] = pair;
      const preference = p.queue!;
      const next = await this.newMatch();
      const role: Role =
        preference !== 'either'
          ? preference
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
    }
  }

  async newMatch(simulated = false) {
    await this.available();

    if (this.atCapacity()) throw new ActionError(BUSY_MESSAGE);

    const id = crypto.randomUUID();

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
      choice: null,
      reason: '',
      message: null,
      ...(simulated ? { simulated: true } : {}),
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

  rematchPeer(m: Match, p: Peer) {
    return [...this.peers.values()].find(
      (other) =>
        other.session !== p.session &&
        other.roomId === m.id &&
        !other.queue &&
        this.role(m, other) !== null &&
        !this.activeSession(other),
    );
  }

  clearRematch(m: Match | undefined, p: Peer) {
    if (!m || !ended(m.phase)) return;

    const role = this.role(m, p);

    if (role && m.rematch) delete m.rematch[role];

    this.broadcast(m);
  }

  async rematch(m: Match | undefined, p: Peer, preference: QueuePreference | null) {
    const role = m && this.role(m, p);

    if (!m || !role || !ended(m.phase) || !m.inviteToken || m.simulated)
      throw new ActionError('Rematches are only available after a friend game.');

    if (p.queue || this.activeSession(p))
      throw new ActionError('Finish your current game or leave the queue first.');

    m.rematch ??= {};

    if (preference === null) {
      delete m.rematch[role];
      this.broadcast(m);

      return;
    }

    const other = this.rematchPeer(m, p);

    if (!other) throw new ActionError('Your friend has left. Create a new invitation instead.');

    m.rematch[role] = preference;

    const opposite = role === 'human' ? 'judge' : 'human';
    const otherPreference = m.rematch[opposite];

    if (!otherPreference || (preference !== 'either' && preference === otherPreference)) {
      this.broadcast(m);

      return;
    }

    let next: Match;

    try {
      next = await this.newMatch();
    } catch (error) {
      m.rematch = {};
      this.broadcast(m);

      throw error;
    }

    const assigned: Role =
      preference !== 'either'
        ? preference
        : otherPreference === 'human'
          ? 'judge'
          : otherPreference === 'judge'
            ? 'human'
            : Math.random() < 0.5
              ? 'human'
              : 'judge';

    next.inviteToken = crypto.randomUUID() + crypto.randomUUID();
    this.assign(next, p, assigned);
    this.assign(next, other, assigned === 'human' ? 'judge' : 'human');
    next.phase = 'ready';
    m.rematch = {};
    this.broadcast(m);
    await this.persist(next);
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
      case 'rematch':
        await this.rematch(m, p, c.role);

        return;
      case 'queue': {
        p.roomId = undefined;
        p.queue = c.role;
        p.queueOrder = ++this.queueSequence;
        this.clearRematch(m, p);
        await this.matchQueued();
        await this.lobby();

        return;
      }
      case 'cancel':
        p.queue = undefined;
        this.clearRematch(m, p);
        await this.lobby(p);

        return;
      case 'create': {
        const next = await this.newMatch();

        next.inviteToken = crypto.randomUUID() + crypto.randomUUID();

        this.assign(
          next,
          p,
          c.role === 'either' ? (Math.random() < 0.5 ? 'human' : 'judge') : c.role,
        );

        await this.persist(next);
        this.clearRematch(m, p);

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
        this.clearRematch(m, p);

        return;
      }
      case 'home': {
        if (m && !ended(m.phase) && this.role(m, p))
          throw new ActionError('Leave your match before opening another page.');

        p.queue = undefined;
        p.roomId = undefined;
        this.clearRematch(m, p);
        await this.lobby(p);

        return;
      }
      case 'leave':
        if (m && !ended(m.phase) && this.role(m, p) !== null)
          await this.finish(m, 'abandoned', 'A player left. This match was not counted.');

        p.queue = undefined;
        p.roomId = undefined;
        this.clearRematch(m, p);
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
      const bot = this.ai.start(
        m.id,
        m.humanLabel,
        {
          state: (state) => {
            void this.run(() => this.receiveBot(m, state));
          },
          beforeRequest: () =>
            this.run(async () => {
              if (
                !['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase) ||
                (m.deadline !== null && this.now() >= m.deadline)
              )
                throw new AIError('match_closed');
            }),
          failed: (error) => {
            void this.run(async () => {
              if (ended(m.phase) || m.phase === 'verdict') return;

              const exhausted = error instanceof AIError && error.code === 'openrouter_402';

              if (exhausted) this.ai.reportCreditExhausted?.();

              await this.finish(
                m,
                'failed',
                exhausted
                  ? CAPACITY_INTERRUPTED
                  : 'The AI is unavailable. This match was not counted.',
              );

              console.error(
                'Bot unavailable:',
                error instanceof AIError ? error.code : 'worker_error',
              );
            });
          },
          ...(m.trace ? { trace: m.trace } : {}),
        },
        m.simulated ? { trace: true } : undefined,
      );

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
    await this.persist(m);
  }

  async disconnect(p: Peer) {
    this.peers.delete(p.id);

    const m = p.roomId ? this.rooms.get(p.roomId) : undefined;
    // Transport loss never changes match state, deadlines or pending AI work.

    this.clearRematch(m, p);

    if (m) this.broadcast(m);

    await this.lobby();
  }

  async expire(m: Match) {
    if (m.phase === 'chat') {
      m.phase = 'verdict';
      m.deadline = this.now() + LIMITS.actionMs;
      this.stopBot(m);
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
    if (this.ai.unavailable?.()) for (const p of this.peers.values()) delete p.queue;

    if (this.ai.capacityExhausted?.()) {
      for (const m of this.rooms.values()) {
        if (!ended(m.phase) && m.phase !== 'verdict')
          await this.finish(m, 'failed', CAPACITY_INTERRUPTED);
      }
    }

    for (const m of this.rooms.values()) {
      if (!ended(m.phase) && m.deadline !== null && this.now() >= m.deadline) await this.expire(m);

      if (ended(m.phase) && ![...this.peers.values()].some((p) => p.roomId === m.id))
        this.rooms.delete(m.id);
    }

    await this.matchQueued();
    await this.lobby();
  }
}
