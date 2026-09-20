export function retryDelay(attempt: number, serverSeconds = 0, random = Math.random) {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));

  return Math.max(1000, serverSeconds * 1000, ceiling * (0.5 + random() * 0.5));
}

export function retryAfter(value: string | null): number {
  if (!value) return 0;

  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - Date.now()) / 1000;

  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 300)) : 0;
}
