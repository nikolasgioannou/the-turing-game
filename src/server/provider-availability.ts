export const CAPACITY_MESSAGE = 'AI games are temporarily unavailable. Please check back soon.';
export const CAPACITY_INTERRUPTED =
  'The AI became unavailable, so we had to stop this game. It won’t count as a win or loss.';
const CHECK_MESSAGE = 'We’re having trouble connecting to the AI. Please try again shortly.';
const REFRESH_MS = 30_000;

// OpenRouter owns the budget. This is only a short-lived availability cache.
export class ProviderAvailability {
  private state: 'unknown' | 'available' | 'exhausted' = 'unknown';
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
    return this.state === 'available' ? null : this.exhausted ? CAPACITY_MESSAGE : CHECK_MESSAGE;
  }

  reportExhausted() {
    this.state = 'exhausted';
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
        data?: { limit_remaining?: unknown; limit?: unknown };
      };

      if (revision !== this.revision) return;

      const data = result.data;
      const remaining = data?.limit_remaining;
      // Null is valid only for an explicitly unlimited key. Missing fields are not zero.

      if (remaining === null && data?.limit === null) this.state = 'available';
      else if (typeof remaining === 'number' && Number.isFinite(remaining))
        this.state = remaining > 0 ? 'available' : 'exhausted';
      else throw new Error('invalid_key_status');
    } catch {
      if (revision === this.revision && !this.exhausted) this.state = 'unknown';
    } finally {
      if (revision === this.revision) this.nextCheck = this.now() + REFRESH_MS;
    }
  }
}
