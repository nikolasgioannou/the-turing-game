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

## Conversation controller

Opening model history is system, judge, hidden human sample, then AI output. Later calls use public
history with native assistant roles and explicit reply target/evidence. `conversation.ts` determines
eligibility from the latest judge turn, human evidence and whether the AI already answered. Shared
questions wait for a stable draft or submitted answer. Explicit AI addresses can proceed
independently. Only clear peer-directed input can prompt a reply after the AI has answered; there
are no idle calls. This is conservative routing rather than a semantic classifier, so ambiguous peer
remarks may be skipped.

Generation snapshots public message IDs and private draft revision. Changes discard unpublished work
while settling measured usage. Draft changes also invalidate queued draft-based responses. Published
lines never trigger new calls. A contribution may contain multiple delayed lines, interrupted by new
public input. Duplicate contributions and [WAIT] stop further work until new evidence. The
controller uses recent median human reply delays and measured typing rates to calibrate publication
timing. Draft timing lives in match attention; draft text remains transient. No training or
cross-match learning.

Bounded model history prefers retaining the opening but protects the current judge question, latest
assistant identity context and latest input before removing older context. Local development origin
checks permit this machine's loopback and IPv4 interfaces on the configured port.

## Tailwind styling and source formatting

Tailwind v4 uses the existing @tailwindcss/vite integration. src/client/styles.css is the only CSS
entrypoint: @theme owns game colors/fonts, @source scans client files only, base rules own element
defaults, and the components layer owns shared controls and arcade effects. ChatMessageItem is
shared by active chat and replay with static Tailwind classes. Do not append alternate-theme
overrides or dynamically construct utility names.

The project-local tailwind-design-system skill informed this refactor. Reference:
https://tailwindcss.com/docs/theme and https://tailwindcss.com/docs/styling-with-utility-classes.
prettier-plugin-tailwindcss sorts classes using this stylesheet.

bun run format runs Prettier plus syntax-aware blank-line spacing between logical sections, hooks,
functions and control-flow statements. bun run format:check checks both. The spacing pass uses
Prettier's bundled TypeScript parser, leaving strings, JSX text and object/array data intact.
Tracked project files and new non-ignored files are included; generated assets, model weights,
databases, dependencies and vendored skills remain excluded.

The project-owned component library now lives in `src/client/ui` (see its README for variants and
usage). Buttons, links, selection controls, fields, panels, modal behavior and game layout wrappers
own their static Tailwind classes. Game routes consume these components. Native form/ARIA props are
forwarded; submit buttons are explicit and the modal restores trigger focus. The stylesheet is
limited to theme/font/global rules and custom arcade effects. Workspace VS Code settings associate
CSS with the Tailwind language mode, with IntelliSense recommended locally.

Live contestant drafts use a bounded `draft` WebSocket command, sampled by the client every 300 ms
only while the human contestant's live-chat composer is enabled. The game authorizes the session and
holds the latest draft outside Match in a transient map. No broadcast or persistence occurs. The
snapshot can schedule a call after a stable pause; revisions invalidate unpublished draft-based
work. Drafts expire after 15 seconds without updates and clear on send, deletion, disconnect, chat
closure or match finish. Model context escapes/masks draft text and explicitly marks it as
unfinished and unseen. DevTools capture is disabled for invocations containing drafts, keeping
unsent content out of traces. Existing opening behavior is unchanged.
