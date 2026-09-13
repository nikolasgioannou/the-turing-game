import {
  characters,
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
  messages: ChatMessage[];
  startedAt: number | null;
  openingHuman: string | null;
  aiDueAt: number | null;
  aiRequests: number;
  attention?: {
    seenHumanIds: string[];
    burstStarted: number | null;
    silenceUsed: boolean;
    lastContribution: string;
  };
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
  controllers = new Map<string, AbortController>();
  private pendingReplies = new Map<string, { lines: string[]; due: number; sender: Label }>();
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
        phase: m.phase as 'ready' | 'opening' | 'opening_ai' | 'chat' | 'verdict',
        deadline: m.deadline,
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
      aiDueAt: null,
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
          await this.finish(m, 'abandoned', 'A player left. This match was not counted.');
        p.queue = undefined;
        p.roomId = undefined;
        await this.lobby(p);
        return;
    }
    if (!m || ended(m.phase)) throw new ActionError('This match is no longer accepting actions.');
    const role = this.role(m, p);
    if (c.type === 'message') {
      if (role === 'spectator' || !['ready', 'opening', 'chat'].includes(m.phase))
        throw new ActionError('Chat is not accepting messages.');
      if (m.phase === 'ready' && role !== 'judge')
        throw new ActionError('The judge starts the chat.');
      if (m.phase === 'opening') {
        if (role !== 'human') throw new ActionError('Wait for the opening replies.');
        m.openingHuman = c.text;
        m.phase = 'opening_ai';
        m.deadline = null;
        await this.persist(m);
        await this.generate(m);
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
        await this.persist(m);
        return;
      }
      m.messages.push({ id: crypto.randomUUID(), sender, text: c.text, sentAt: this.now() });
      // A person interrupts unsent lines. Reconsider against the complete new burst.
      this.pendingReplies.delete(m.id);
      const attention = this.attention(m);
      attention.silenceUsed = false;
      attention.burstStarted ??= this.now();
      const lastAI =
        [...m.messages]
          .reverse()
          .find((message) => message.sender !== 'judge' && message.sender !== m.humanLabel)
          ?.sentAt ?? 0;
      m.aiDueAt = Math.max(
        lastAI + 2000,
        Math.min(this.now() + 1200 + Math.random() * 600, attention.burstStarted + 4500),
      );
      await this.persist(m);
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
        !['ready', 'opening', 'opening_ai', 'chat'].includes(m.phase)
      )
        throw new ActionError('Only spectators can submit an audience guess.');
      m.votes[p.session] = c.choice;
      await this.persist(m);
    }
  }
  private attention(m: Match) {
    return (m.attention ??= {
      seenHumanIds: [],
      burstStarted: null,
      silenceUsed: false,
      lastContribution: '',
    });
  }
  private humanMessages(m: Match) {
    return m.messages.filter(
      (message) => message.sender === 'judge' || message.sender === m.humanLabel,
    );
  }
  private scheduleSilence(m: Match) {
    m.aiDueAt = this.attention(m).silenceUsed ? null : this.now() + 8000 + Math.random() * 4000;
  }
  private queueReplyLines(m: Match, sender: Label, lines: string[]) {
    if (!lines.length) return;
    const delay = Math.min(3500, Math.max(650, 400 + characters(lines[0]!) * 45));
    this.pendingReplies.set(m.id, { lines, sender, due: this.now() + delay });
    m.aiDueAt = null;
  }
  async generate(m: Match) {
    const opening = m.phase === 'opening_ai';
    if (
      (!opening && (m.phase !== 'chat' || this.now() >= m.deadline!)) ||
      this.controllers.has(m.id) ||
      this.pendingReplies.has(m.id) ||
      m.aiRequests >= LIMITS.aiRequests
    )
      return;
    const attention = this.attention(m);
    const humanSnapshot = this.humanMessages(m).map((message) => message.id);
    const unseen = this.humanMessages(m).filter(
      (message) => !attention.seenHumanIds.includes(message.id),
    );
    const silence = !opening && unseen.length === 0;
    if (silence && attention.silenceUsed) {
      m.aiDueAt = null;
      return;
    }
    if (silence) attention.silenceUsed = true;
    attention.burstStarted = null;
    const input: AIInput = {
      label: m.humanLabel === 'A' ? 'B' : 'A',
      matchId: m.id,
      ...(!opening
        ? {
            invocation: {
              reason: silence
                ? ('silence' as const)
                : unseen.at(-1)?.sender === 'judge'
                  ? ('judge_message' as const)
                  : ('opponent_message' as const),
              newHumanMessages: unseen.length,
            },
          }
        : {}),
      messages: m.messages.map(({ sender, text }) => ({ sender, text })),
      ...(opening ? { privateOpeningReference: m.openingHuman! } : {}),
    };
    let requestId: string;
    try {
      requestId = await this.store.beginRequest(m.id, {
        model: this.ai.model,
        promptVersion: PROMPT_VERSION,
        messageCount: m.messages.length,
        request: m.aiRequests + 1,
        trigger: opening ? 'opening' : input.invocation?.reason,
        newHumanMessageIds: unseen.map((message) => message.id),
      });
    } catch {
      await this.finish(m, 'failed', 'The AI could not start. This match was not counted.');
      return;
    }
    m.aiRequests++;
    m.aiDueAt = null;
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
          const lines = result.text
            .split(/\r\n|[\n\r]/u)
            .map((line) => line.trim())
            .filter(Boolean);
          const firstLine = lines.shift() ?? '';
          if (opening && m.phase === 'opening_ai') {
            if (result.text === '[WAIT]') {
              await this.finish(m, 'failed', 'The AI did not answer. This match was not counted.');
              return;
            }
            const sentAt = this.now();
            const pair: ChatMessage[] = [
              { id: crypto.randomUUID(), sender: m.humanLabel, text: m.openingHuman!, sentAt },
              { id: crypto.randomUUID(), sender: input.label, text: firstLine, sentAt },
            ];
            if (Math.random() < 0.5) pair.reverse();
            m.messages.push(...pair);
            m.openingHuman = null;
            m.phase = 'chat';
            m.startedAt = sentAt;
            m.deadline = sentAt + LIMITS.chatMs;
            attention.seenHumanIds = this.humanMessages(m).map((message) => message.id);
            attention.lastContribution = result.text;
            this.scheduleSilence(m);
            this.queueReplyLines(m, input.label, lines);
            await this.persist(m);
            return;
          }
          if (m.phase !== 'chat') return;
          if (this.now() >= m.deadline!) {
            await this.expire(m);
            return;
          }
          // Never publish a draft composed before an intervening human message.
          const currentHumanIds = this.humanMessages(m).map((message) => message.id);
          if (currentHumanIds.at(-1) !== humanSnapshot.at(-1)) {
            // The message handler has already scheduled reconsideration after the burst.
            await this.persist(m);
            return;
          }
          attention.seenHumanIds = humanSnapshot;
          const normalize = (text: string) => text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
          const duplicate = normalize(result.text) === normalize(attention.lastContribution);
          if (result.text === '[WAIT]' || duplicate || !firstLine) {
            // Declining to speak must not start another idle polling loop.
            attention.silenceUsed = true;
            m.aiDueAt = null;
          } else {
            attention.lastContribution = result.text;
            m.messages.push({
              id: crypto.randomUUID(),
              sender: input.label,
              text: firstLine,
              sentAt: this.now(),
            });
            this.scheduleSilence(m);
            this.queueReplyLines(m, input.label, lines);
          }
          await this.persist(m);
        }),
      )
      .catch((error) =>
        this.run(async () => {
          await this.store.settleRequest(requestId, null, {
            status: 'failed',
            code: error instanceof AIError ? error.code : 'unknown',
          });
          if (m.phase !== 'chat' && m.phase !== 'opening_ai') return;
          if (m.phase === 'chat' && this.now() >= m.deadline!) {
            await this.expire(m);
            return;
          }
          await this.store.pause(
            'The AI is temporarily unavailable. Please try again later.',
            error instanceof AIError ? error.retryMs : 60_000,
          );
          await this.finish(
            m,
            'failed',
            'The AI is temporarily unavailable. This match was not counted.',
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
        m.message = 'The game service is unavailable. This match was not counted.';
        this.broadcast(m);
        console.error(
          'Could not persist AI finalization; startup recovery will retain the conservative charge.',
        );
      });
  }
  async finish(m: Match, phase: Phase, message: string | null) {
    this.pendingReplies.delete(m.id);
    m.phase = phase;
    m.message = message;
    m.aiDueAt = null;
    m.deadline = null;
    this.controllers.get(m.id)?.abort();
    await this.store.release(m.id);
    await this.persist(m);
  }
  async disconnect(p: Peer) {
    this.peers.delete(p.id);
    const m = p.roomId ? this.rooms.get(p.roomId) : undefined;
    if (m && !ended(m.phase) && this.role(m, p) !== 'spectator')
      await this.finish(m, 'abandoned', 'A player disconnected. This match was not counted.');
    else if (m) this.broadcast(m);
    await this.lobby();
  }
  async expire(m: Match) {
    if (m.phase === 'chat') {
      this.pendingReplies.delete(m.id);
      m.phase = 'verdict';
      m.deadline = this.now() + LIMITS.actionMs;
      m.aiDueAt = null;
      this.controllers.get(m.id)?.abort();
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
      const pending = this.pendingReplies.get(m.id);
      if (m.phase === 'chat' && pending && this.now() >= pending.due) {
        const text = pending.lines.shift()!;
        m.messages.push({
          id: crypto.randomUUID(),
          sender: pending.sender,
          text,
          sentAt: this.now(),
        });
        this.pendingReplies.delete(m.id);
        this.scheduleSilence(m);
        this.queueReplyLines(m, pending.sender, pending.lines);
        await this.persist(m);
      }
      if (m.phase === 'chat' && m.aiDueAt !== null && this.now() >= m.aiDueAt)
        await this.generate(m);
      if (ended(m.phase) && ![...this.peers.values()].some((p) => p.roomId === m.id))
        this.rooms.delete(m.id);
    }
    await this.lobby();
  }
}
