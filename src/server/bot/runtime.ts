// Unicode-aware text operations and deterministic dependencies used by the engine.
export const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean);
export const chars = (text: string) => Array.from(text);
export const length = (text: string) => chars(text).length;
export const cut = (text: string, start = 0, end?: number) =>
  chars(text).slice(start, end).join('');
export const upper = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);
export const alpha = (text: string) => /^\p{L}+$/u.test(text);
export const round = (value: number) => {
  const floor = Math.floor(value);

  return value - floor === 0.5 ? floor + (floor % 2) : Math.round(value);
};

export function format(template: string, ...values: (string | number)[]) {
  let i = 0;

  return template.replace(/%%|%(?:\.(\d+))?([sdf])/g, (token, precision, kind) => {
    if (token === '%%') return '%';

    const value = values[i++];

    return kind === 'd'
      ? String(Math.trunc(Number(value)))
      : kind === 'f'
        ? Number(value).toFixed(Number(precision ?? 6))
        : String(value);
  });
}

export const asciiJson = (text: string) =>
  JSON.stringify(text).replace(
    /[\u007f-\uffff]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matches(pattern: string, text: string) {
  return [...text.matchAll(new RegExp(pattern, 'giu'))].map((m) => m[0]);
}
// Longest contiguous matching blocks, with popular-character suppression for long inputs.
// The traversal/tie order matters for asymmetric sentence similarity.

export function similarity(aText: string, bText: string) {
  const a = chars(aText),
    b = chars(bText);
  const positions = new Map<string, number[]>();

  b.forEach((c, i) => {
    const list = positions.get(c) ?? [];

    list.push(i);
    positions.set(c, list);
  });

  if (b.length >= 200)
    for (const [c, list] of positions)
      if (list.length > Math.floor(b.length / 100) + 1) positions.delete(c);

  const queue: number[][] = [[0, a.length, 0, b.length]];
  let total = 0;

  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    let bestI = alo,
      bestJ = blo,
      best = 0;
    let previous = new Map<number, number>();

    for (let i = alo; i < ahi; i++) {
      const current = new Map<number, number>();

      for (const j of positions.get(a[i]) ?? []) {
        if (j < blo) continue;

        if (j >= bhi) break;

        const size = (previous.get(j - 1) ?? 0) + 1;

        current.set(j, size);

        if (size > best) {
          bestI = i - size + 1;
          bestJ = j - size + 1;
          best = size;
        }
      }

      previous = current;
    }

    while (bestI > alo && bestJ > blo && a[bestI - 1] === b[bestJ - 1]) {
      bestI--;
      bestJ--;
      best++;
    }

    while (bestI + best < ahi && bestJ + best < bhi && a[bestI + best] === b[bestJ + best]) best++;

    if (!best) continue;

    total += best;

    if (alo < bestI && blo < bestJ) queue.push([alo, bestI, blo, bestJ]);

    if (bestI + best < ahi && bestJ + best < bhi)
      queue.push([bestI + best, ahi, bestJ + best, bhi]);
  }

  return a.length + b.length ? (2 * total) / (a.length + b.length) : 1;
}

export function sleep(seconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();

    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      Math.max(0, seconds * 1000),
    );

    signal.addEventListener('abort', abort, { once: true });
  });
}

export class Task {
  done = false;
  readonly promise: Promise<void>;

  constructor(run: () => Promise<void>, failed: (error: unknown) => void) {
    this.promise = run()
      .catch(failed)
      .finally(() => {
        this.done = true;
      });
  }
}
