import type { ServerWebSocket } from 'bun';
import { resolve, sep } from 'node:path';
import { database } from './database';
import { Store } from './store';
import { createAI } from './ai';
import { ActionError, Game, type Peer } from './game';

const production = process.env.NODE_ENV === 'production';

if (production && (!process.env.DATABASE_URL || !process.env.APP_ORIGIN))
  throw new Error('Production requires DATABASE_URL and APP_ORIGIN.');

const port = Number(process.env.PORT ?? 3000);
const origin = process.env.APP_ORIGIN ?? `http://localhost:${port}`;
const allowedOrigins = new Set([origin]);

if (!production) {
  for (const host of ['localhost', '127.0.0.1', '[::1]'])
    allowedOrigins.add(`http://${host}:${port}`);
}

const db = await database(process.env.DATABASE_URL);
const cap = (key: string, fallback: number) => {
  const value = Number(process.env[key] ?? fallback);

  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${key}`);

  return value;
};
const store = new Store(db, {
  input: cap('DAILY_INPUT_TOKEN_CAP', 1_000_000),
  output: cap('DAILY_OUTPUT_TOKEN_CAP', 100_000),
});

await store.init();
await store.recover();

const game = new Game(store, createAI());
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...headers, ...extra } });
const session = (req: Request) => {
  const match = req.headers.get('cookie')?.match(/(?:^|;\s*)turing_session=([a-f0-9-]{36})(?:;|$)/);

  return match?.[1];
};

type SocketData = {
  peer: Peer;
  lastPing: number;
  window: number;
  messages: number;
  drafts: number;
};

const sockets = new Set<ServerWebSocket<SocketData>>();
const perIp = new Map<string, { count: number; until: number }>();
const root = resolve('dist');
const server = Bun.serve<SocketData>({
  hostname: production ? '0.0.0.0' : '127.0.0.1',
  port,
  maxRequestBodySize: 16_384,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/api/health') return json({ ok: true });

    if (url.pathname === '/api/session' && req.method === 'GET') {
      const id = session(req) ?? crypto.randomUUID();

      return json({ ok: true }, 200, {
        'Set-Cookie': `turing_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${production ? '; Secure' : ''}`,
      });
    }

    if (url.pathname === '/ws') {
      if (!allowedOrigins.has(req.headers.get('origin') ?? ''))
        return json({ error: 'Origin not allowed' }, 403);

      const id = session(req);

      if (!id) return json({ error: 'Start a session first' }, 401);

      const ip = server.requestIP(req)?.address ?? 'unknown';
      const counter = perIp.get(ip);

      if (counter && counter.until > Date.now() && counter.count >= 60)
        return json({ error: 'Too many connections. Try again shortly.' }, 429);

      perIp.set(ip, {
        count: counter && counter.until > Date.now() ? counter.count + 1 : 1,
        until: counter && counter.until > Date.now() ? counter.until : Date.now() + 60_000,
      });

      if (
        game.peers.size >= 1000 ||
        [...game.peers.values()].filter((p) => p.session === id).length >= 5
      )
        return json({ error: 'Connection limit reached' }, 429);

      const peer: Peer = { id: crypto.randomUUID(), session: id, send: () => {} };

      if (
        server.upgrade(req, {
          data: { peer, lastPing: Date.now(), window: Date.now(), messages: 0, drafts: 0 },
        })
      )
        return;

      return json({ error: 'WebSocket upgrade failed' }, 400);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });

    let path: string;

    try {
      path = resolve(root, '.' + decodeURIComponent(url.pathname));
    } catch {
      return new Response(null, { status: 400 });
    }

    if (path !== root && !path.startsWith(root + sep)) return new Response(null, { status: 403 });

    let file = Bun.file(path);

    if (!(await file.exists())) {
      if (url.pathname !== '/') return json({ error: 'Not found' }, 404);

      file = Bun.file(resolve(root, 'index.html'));
    }

    if (!(await file.exists()))
      return new Response('Start the Vite development server or run bun run build.', {
        status: 503,
      });

    return new Response(req.method === 'HEAD' ? null : file, {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        'Cache-Control': url.pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      },
    });
  },
  websocket: {
    maxPayloadLength: 16_384,
    idleTimeout: 60,
    open(ws) {
      sockets.add(ws);

      ws.data.peer.send = (event) => {
        ws.send(JSON.stringify(event));
      };

      void game.run(() => game.connect(ws.data.peer));
    },
    message(ws, data) {
      const now = Date.now();

      ws.data.lastPing = now;

      if (now - ws.data.window > 10_000) {
        ws.data.window = now;
        ws.data.messages = 0;
        ws.data.drafts = 0;
      }

      let raw: unknown;

      try {
        raw = JSON.parse(String(data));
      } catch {
        if (++ws.data.messages > 60) ws.close(1008, 'Too many messages');
        else ws.data.peer.send({ type: 'error', message: 'Invalid message.' });

        return;
      }

      const isDraft =
        typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'draft';

      if (isDraft ? ++ws.data.drafts > 100 : ++ws.data.messages > 60) {
        ws.close(1008, 'Too many messages');

        return;
      }

      void game.run(async () => {
        try {
          await game.handle(ws.data.peer, raw);
        } catch (error) {
          ws.data.peer.send({
            type: 'error',
            message:
              error instanceof ActionError
                ? error.message
                : 'Something went wrong. Please try again.',
          });
        }
      });
    },
    close(ws) {
      sockets.delete(ws);
      void game.run(() => game.disconnect(ws.data.peer));
    },
  },
});
const timer = setInterval(() => {
  for (const ws of sockets)
    if (Date.now() - ws.data.lastPing > 45_000) ws.close(1001, 'Connection lost');

  for (const [ip, r] of perIp) if (r.until < Date.now()) perIp.delete(ip);

  void game.run(() => game.tick());
}, 1000);
let stopping = false;

async function stop() {
  if (stopping) return;

  stopping = true;
  clearInterval(timer);

  await game.run(async () => {
    for (const m of game.rooms.values())
      if (!['complete', 'failed', 'abandoned'].includes(m.phase))
        await game.finish(m, 'failed', 'The server restarted. This match was not counted.');
  });

  await server.stop(true);
  await db.close();
  process.exit();
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
console.log(`The Turing Game listening on ${server.url} (OpenRouter)`);
