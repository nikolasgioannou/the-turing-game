import { isIP } from 'node:net';

export function normalizeIP(value: string | null | undefined): string | null {
  if (!value || !isIP(value)) return null;

  if (isIP(value) === 4) return value;

  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);

  if (canonical.startsWith('::ffff:')) {
    const parts = canonical.slice(7).split(':');

    if (parts.length === 2) {
      const n = parts.map((part) => parseInt(part, 16));

      return [n[0]! >> 8, n[0]! & 255, n[1]! >> 8, n[1]! & 255].join('.');
    }
  }

  return canonical;
}

// Fly's HTTP service is the public ingress. Private organization peers are trusted.
// Never enable this for a directly exposed listener or an untrusted private network.
export function clientIP(headers: Headers, address: string | undefined, flyProxy: boolean) {
  const direct = normalizeIP(address);

  const privatePeer =
    direct && (direct.startsWith('fdaa:') || /^172\.(1[6-9]|2\d|3[01])\./.test(direct));

  if (flyProxy && privatePeer) return normalizeIP(headers.get('fly-client-ip')) ?? direct;

  return direct ?? 'unknown';
}

export class ConnectionLimiter {
  private entries = new Map<string, { count: number; until: number }>();

  constructor(private now = Date.now) {}

  take(ip: string): boolean {
    this.prune();

    const entry = this.entries.get(ip);

    if (entry && entry.count >= 60) return false;
    // Bound memory even when an attacker rotates addresses.

    if (!entry && this.entries.size >= 10_000) return false;

    this.entries.set(ip, {
      count: (entry?.count ?? 0) + 1,
      until: entry?.until ?? this.now() + 60_000,
    });

    return true;
  }

  prune() {
    for (const [key, entry] of this.entries)
      if (entry.until <= this.now()) this.entries.delete(key);
  }
}
