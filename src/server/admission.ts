export class AdmissionError extends Error {}

type Bucket = { tokens: number; at: number };

export class StartLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private now = Date.now) {}

  take(actors: { session: string; ip?: string }[], simulated = false, commit = true) {
    const now = this.now();

    for (const [key, bucket] of this.buckets)
      if (now - bucket.at > 600_000) this.buckets.delete(key);

    const policies = new Map<string, { burst: number; refill: number }>();

    for (const actor of actors) {
      policies.set(`session:${actor.session}`, { burst: 6, refill: 30_000 });

      if (actor.ip) policies.set(`network:${actor.ip}`, { burst: 30, refill: 3000 });
    }

    if (simulated) policies.set('operator', { burst: 20, refill: 5000 });

    const updates: [string, Bucket][] = [];
    let wait = 0;

    for (const [key, policy] of policies) {
      const previous = this.buckets.get(key);
      const tokens = previous
        ? Math.min(policy.burst, previous.tokens + (now - previous.at) / policy.refill)
        : policy.burst;

      wait = Math.max(wait, (1 - tokens) * policy.refill);
      updates.push([key, { tokens: tokens - 1, at: now }]);
    }

    if (wait > 0)
      throw new AdmissionError(
        `You’re starting games too quickly. Try again in ${Math.ceil(wait / 1000)} seconds.`,
      );

    if (this.buckets.size + updates.filter(([key]) => !this.buckets.has(key)).length > 20_000)
      throw new AdmissionError('Game starts are busy. Please try again shortly.');

    if (commit) for (const [key, bucket] of updates) this.buckets.set(key, bucket);
  }
}

export class RequestLimiter {
  private active = 0;
  private byGame = new Map<string, number>();
  private waiting: {
    key: string;
    signal: AbortSignal;
    ok: (release: () => void) => void;
    fail: (error: Error) => void;
    abort: () => void;
  }[] = [];

  constructor(
    private maximum = 40,
    private perGame = 2,
    private maxWaiting = 80,
  ) {}

  acquire(key: string, signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();

    if (this.waiting.length >= this.maxWaiting)
      return Promise.reject(new Error('Model requests are busy'));

    return new Promise((ok, fail) => {
      const entry = {
        key,
        signal,
        ok,
        fail,
        abort: () => {
          const index = this.waiting.indexOf(entry);

          if (index >= 0) this.waiting.splice(index, 1);

          fail(new Error('Model request canceled'));
        },
      };

      signal.addEventListener('abort', entry.abort, { once: true });
      this.waiting.push(entry);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.maximum) {
      const index = this.waiting.findIndex(
        (entry) => (this.byGame.get(entry.key) ?? 0) < this.perGame,
      );

      if (index < 0) return;

      const entry = this.waiting.splice(index, 1)[0]!;

      entry.signal.removeEventListener('abort', entry.abort);
      this.active++;
      this.byGame.set(entry.key, (this.byGame.get(entry.key) ?? 0) + 1);

      let released = false;

      entry.ok(() => {
        if (released) return;

        released = true;
        this.active--;

        const remaining = this.byGame.get(entry.key)! - 1;

        if (remaining) this.byGame.set(entry.key, remaining);
        else this.byGame.delete(entry.key);

        this.drain();
      });
    }
  }
}

export const modelRequests = new RequestLimiter();
