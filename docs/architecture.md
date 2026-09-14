# Architecture

React + Vite + Tailwind client, Bun HTTP/WebSocket server, PostgreSQL. Full-stack SSR (e.g. TanStack
Start) adds little to a socket-driven game; the same Bun process serves the built frontend and
authoritative game engine. Shared TypeScript schemas validate untrusted socket messages.

## Database decision

The initial SQLite proposal was replaced by PostgreSQL at the user's request before persistence was
implemented. Production targets Fly Managed Postgres; project-local PGlite runs actual PostgreSQL in
WASM for development/tests. This avoids a global database install. Production requires DATABASE_URL
and never silently falls back to PGlite. The same SQL schema and queries serve both adapters, but an
actual networked PostgreSQL deployment smoke test remains required.

## Boundaries

- shared/protocol.ts: limits, wire schemas and explicit public views.
- server/database.ts: Postgres/PGlite query and transaction adapters.
- server/store.ts: idempotent schema setup, match snapshots, request ledger, usage reservations and
  provider availability.
- server/ai.ts: real provider adapter.
- server/game.ts: state machine, matchmaking, deadlines, role authorization, serialization.
- server/index.ts: HTTP, anonymous HttpOnly cookie identity, socket lifecycle and static assets.
- client/: dashboard, room, replay and live state.

Anonymous HttpOnly cookies identify browser sessions. Different human roles require different
browser sessions/devices. Seat membership belongs to the HttpOnly browser session. New sockets
automatically resume the active match, and same-session match links restore the participant view.
Transport loss does not change match state or deadlines; explicit leave still forfeits. Multiple
tabs share the same seat, never opposite roles. Invite tokens are distinct from public match IDs and
passed in URL fragments so they do not enter HTTP request logs. No auth accounts or admin dashboard
are needed; deployment secrets/config control operations.

PostgreSQL row-lock transactions reserve a conservative per-match input/output allowance. AI prompts
have a UTF-8 byte upper bound used as conservative token allowance for the supported byte-based
tokenizer. A new provider adapter must supply safe bounds if introducing another tokenizer. Requests
are pre-charged before dispatch; actual usage reconciles each request; unknown reports keep
conservative charges. Reserve all ten possible AI requests before admission. Requests crossing UTC
midnight keep their admission-day budget so resets cannot spend active reservations twice. No
automatic retries initially.

## Paired opening and shared chat

State machine: waiting → ready → opening → opening_ai → chat → verdict → complete, with
abandoned/failed exits. Judge starts the opening; the human reply remains private during opening_ai.
One completion reveals the pair in random order at one timestamp and starts the server's 90-second
deadline. Free-chat messages are immediately public. A server tick handles paced AI initiation and
chat expiry. No overlapping AI request per room; messages received during generation remain
available for subsequent calls. Completion checks both phase and deadline before posting. Deadline
expiration releases unused capacity and aborts pending work; late callbacks still settle usage
without altering the transcript or pausing service.

AIInput distinguishes privateOpeningReference from public messages. The adapter emits native message
history: judge and opponent are user messages tagged <judge>/<contestant>, prior AI replies are
assistant messages, and the hidden opening uses <private_opening>. Tag contents are escaped. No
label, time, or transcript JSON is sent to the model. The internal label only selects which messages
become assistant messages. Public RoomView is explicit and never contains AI scheduling state, model
prompt, credentials or mapping. Historical snapshots with rounds are converted to chronological
views, including only revealed answers. Current snapshots persist a messages array and openingHuman
separately.

Input payload is bounded to 7500 conservative byte-based input tokens including overhead, with 512
output tokens. Context keeps the first posted message and newest messages; oldest middle messages
are removed when needed. The local service has an 8192-token cache limit. Long transcripts may lose
older context, so persona consistency remains a testing concern.

## Fly deployment

One always-running Fly app machine initially, with Fly Managed Postgres in the same region. No app
volume needed. Do NOT horizontally scale yet: live rooms and matchmaking have a single in-memory
authority. For scale-out, introduce explicit room-owner routing and shared matchmaking. PostgreSQL
already supports shared persistence and atomic budget enforcement.

Deploy/restart aborts live matches and releases unused capacity. On boot, unfinished snapshots
become technical failures; pre-charged in-flight usage remains accounted. Use one-at-a-time
immediate replacement, not overlapping rolling instances, until room ownership exists. Fly MPG
supplies backups/failover; app availability is still single-instance.

Production requires DATABASE_URL and APP_ORIGIN, plus a running local inference service. API secrets
never enter the frontend. Same-origin WebSocket checks, bounded payloads, rate limits, schema
validation and safe public DTOs protect the public transport.

## AI SDK instrumentation

The local adapter uses Vercel AI SDK `generateText` with `@ai-sdk/openai-compatible`, which is the
protocol used by MLX-VLM. `LOCAL_AI_URL` accepts loopback endpoints only; `LOCAL_AI_MODEL` selects
local weights. No API keys or hosted-provider fallbacks. Opening reasoning is bounded to 256 tokens
inside the 512-token allowance, with fresh sampling seeds. Abort signals, no retries and measured
token accounting remain unchanged.

`AI_DEVTOOLS=true` enables per-call `DevToolsTelemetry`, using the match ID as its run ID without
inserting that ID into the model prompt. Raw body retention supports request/response inspection.
The viewer is a separate loopback-only process. Production rejects enabled tracing; the development
dependency is lazy-loaded and local files are excluded from both git and the Docker build context.

## Style and conversation continuity

The hidden opening style sample precedes the judge message so the judge is the final prompt to
answer. The system prompt adds derived length, casing and punctuation guidance from the latest human
contestant message, never from the judge or prior AI verbosity. Only structural style guidance
enters the system prompt; raw contestant content remains escaped user-message content. DevTools
records the complete derived prompt. The base prompt and version are stored with the match; style
can be reconstructed from the input transcript.

Two consecutive AI posts without a human/judge message pause proactive generation until a person
speaks. Consecutive exact AI duplicates are suppressed; repeating an answer after a new human/judge
message is allowed.

## Conversation-aware scheduling

Match attention tracks seen human message IDs, the start of a message burst, whether a silence
opportunity was consumed, and the last generated contribution. Public opening order never determines
which human input was considered. Each generation snapshots human message IDs; if more arrive before
completion, its measured usage is settled but the stale draft is not published. The pending burst
then triggers a fresh call within the existing reservation. No extra classifier call is used.

Human input resets a 1.2–1.8s debounce bounded by 4.5s from burst start, with a 2s cooldown after
the last AI post. A contribution can schedule one 8–12s silence opportunity. [WAIT] or a normalized
repeat stops idle polling. Multiline responses drain separately without triggering generation; a new
human message cancels unsent lines. All lines stop at expiry or explicit leave, but continue across
transport loss. Prompt v12 has shared rules, phase-specific opening/live instructions, and a live
invocation cue. Production origin restrictions remain exact; local development also permits this
machine's loopback and IPv4 interfaces on the configured port.
