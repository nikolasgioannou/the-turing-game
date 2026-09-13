# Architecture

React + Vite + Tailwind client, Bun HTTP/WebSocket server, PostgreSQL. Full-stack SSR (e.g. TanStack Start) adds little to a socket-driven game; the same Bun process serves the built frontend and authoritative game engine. Shared TypeScript schemas validate untrusted socket messages.

## Database decision

The initial SQLite proposal was replaced by PostgreSQL at the user's request before persistence was implemented. Production targets Fly Managed Postgres; project-local PGlite runs actual PostgreSQL in WASM for development/tests. This avoids a global database install. Production requires DATABASE_URL and never silently falls back to PGlite. The same SQL schema and queries serve both adapters, but an actual networked PostgreSQL deployment smoke test remains required.

## Boundaries

- shared/protocol.ts: limits, wire schemas and explicit public views.
- server/database.ts: Postgres/PGlite query and transaction adapters.
- server/store.ts: idempotent schema setup, match snapshots, request ledger, usage reservations and provider availability.
- server/ai.ts: provider adapter and explicitly local mock.
- server/game.ts: state machine, matchmaking, deadlines, role authorization, serialization.
- server/index.ts: HTTP, anonymous HttpOnly cookie identity, socket lifecycle and static assets.
- client/: dashboard, room, replay and live state.

Anonymous HttpOnly cookies identify browser sessions. Different human roles require different browser sessions/devices. Seat membership is held on a specific socket; disconnect forfeits. Invite tokens are distinct from public match IDs and passed in URL fragments so they do not enter HTTP request logs. No auth accounts or admin dashboard are needed; deployment secrets/config control operations.

PostgreSQL row-lock transactions reserve a conservative per-match input/output allowance. AI prompts have a UTF-8 byte upper bound used as conservative token allowance for the supported byte-based tokenizer. A new provider adapter must supply safe bounds if introducing another tokenizer. Requests are pre-charged before dispatch; actual usage reconciles each request; unknown reports keep conservative charges. Reserve all five rounds before admission. Requests crossing UTC midnight keep their admission-day budget so resets cannot spend active reservations twice. No automatic retries initially.

## Fly deployment

One always-running Fly app machine initially, with Fly Managed Postgres in the same region. No app volume needed. Do NOT horizontally scale yet: live rooms and matchmaking have a single in-memory authority. For scale-out, introduce explicit room-owner routing and shared matchmaking. PostgreSQL already supports shared persistence and atomic budget enforcement.

Deploy/restart aborts live matches and releases unused capacity. On boot, unfinished snapshots become technical failures; pre-charged in-flight usage remains accounted. Use one-at-a-time immediate replacement, not overlapping rolling instances, until room ownership exists. Fly MPG supplies backups/failover; app availability is still single-instance.

Production prohibits mock mode and requires AI_API_KEY, DATABASE_URL and APP_ORIGIN. API secrets never enter the frontend. Same-origin WebSocket checks, bounded payloads, rate limits, schema validation and safe public DTOs protect the public transport.
