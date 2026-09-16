export const CAPACITY_MESSAGE = 'We’ve reached our game limit. Please come back later.';
export const CAPACITY_INTERRUPTED =
  'We reached our game limit and had to end this round early. It won’t count as a win or loss.';
const CHECK_MESSAGE = 'We’re having trouble starting games. Please try again shortly.';
const REFRESH_MS = 30_000;

// OpenRouter owns the budget. This is only a short-lived availability cache.
export class ProviderAvailability {
  private state: 'unknown' | 'available' | 'exhausted' = 'unknown';
  resetsAt?: number;
  private dailyReset = false;
  private nextCheck = 0;
  private revision = 0;
  private pending?: Promise<void>;

  constructor(
    private fetcher: typeof fetch = fetch,
    private now: () => number = Date.now,
    private key: () => string | undefined = () => process.env.OPENROUTER_API_KEY,
  ) {}

  get exhausted() {
    return this.state === 'exhausted';
  }

  get message() {
    if (this.state === 'available') return null;

    if (!this.exhausted) return CHECK_MESSAGE;

    return this.dailyReset
      ? 'We’ve reached today’s game limit. Come back tomorrow.'
      : CAPACITY_MESSAGE;
  }

  reportExhausted() {
    this.state = 'exhausted';
    this.resetsAt = undefined;
    this.dailyReset = false;
    this.revision++;
    this.nextCheck = this.now() + REFRESH_MS;
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;

    if (this.now() < this.nextCheck) return Promise.resolve();

    const revision = this.revision;

    this.pending = this.check(revision).finally(() => {
      this.pending = undefined;
    });

    return this.pending;
  }

  private async check(revision: number) {
    try {
      const key = this.key();

      if (!key) throw new Error('missing_key');

      const response = await this.fetcher('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(3000),
      });

      if (revision !== this.revision) return;

      if (response.status === 402) {
        this.reportExhausted();

        return;
      }

      if (!response.ok) throw new Error('key_status_unavailable');

      const result = (await response.json()) as {
        data?: { limit_remaining?: unknown; limit?: unknown; limit_reset?: unknown };
      };

      if (revision !== this.revision) return;

      const data = result.data;
      const remaining = data?.limit_remaining;
      // Null is valid only for an explicitly unlimited key. Missing fields are not zero.

      if (remaining === null && data?.limit === null) this.state = 'available';
      else if (typeof remaining === 'number' && Number.isFinite(remaining))
        this.state = remaining > 0 ? 'available' : 'exhausted';
      else throw new Error('invalid_key_status');

      this.resetsAt = undefined;
      this.dailyReset = false;

      if (this.exhausted) {
        const date = new Date(this.now());
        const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

        if (data?.limit_reset === 'daily') {
          this.dailyReset = true;
          this.resetsAt = midnight + 86_400_000;
        }

        if (data?.limit_reset === 'weekly')
          this.resetsAt = midnight + (7 - ((date.getUTCDay() + 6) % 7)) * 86_400_000;

        if (data?.limit_reset === 'monthly')
          this.resetsAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      }
    } catch {
      if (revision === this.revision && !this.exhausted) this.state = 'unknown';
    } finally {
      if (revision === this.revision) this.nextCheck = this.now() + REFRESH_MS;
    }
  }
}
