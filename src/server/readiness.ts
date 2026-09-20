// Share probes across callers, including after a timeout, so an outage cannot pile up work.
export class Readiness {
  private pending?: Promise<boolean>;
  private cached?: { at: number; ok: boolean };

  constructor(
    private probe: () => Promise<unknown>,
    private now = Date.now,
    private timeout = 2000,
  ) {}

  async check(): Promise<boolean> {
    if (this.cached && this.now() - this.cached.at < 2000) return this.cached.ok;

    const task = (this.pending ??= Promise.resolve()
      .then(this.probe)
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        this.pending = undefined;
      }));
    let timer: ReturnType<typeof setTimeout>;
    const ok = await Promise.race([
      task,
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), this.timeout);
      }),
    ]);

    clearTimeout(timer!);
    this.cached = { at: this.now(), ok };

    return ok;
  }
}
