# Architecture

React, Vite and Tailwind client; Bun HTTP/WebSocket authority; PostgreSQL in production and
project-local PGlite in development. Shared Zod schemas validate public socket commands.

## Boundaries

- `shared/protocol.ts`: limits, command schemas and explicit public views.
- `server/database.ts`: PostgreSQL/PGlite adapters.
- `server/store.ts`: snapshots, request ledger, daily capacity and reservations.
- `server/game.ts`: sessions, matchmaking, deadlines, scoring and public serialization.
- `server/ai.ts`: private worker lifecycle and OpenRouter transport/accounting.
- `server/bot`: pinned Python reference brain, private transport and source-parity manifest.
- `client/ui`: shared controls and layouts with static Tailwind classes.

One Python standard-library worker per match runs the original reference scheduling loop. JSON lines
carry game input and private drafts into it, and public transcript updates/provider requests out.
Bun routes requests to OpenRouter and returns the text in the response shape expected by the
reference. No direct Anthropic SDK or local inference dependency is needed. Worker diagnostics are
suppressed; prompts, drafts and style cards are not written to application logs.

The reference owns all AI decisions, including its 400 ms loop, live draft planning, opening attack,
2.5-second request hedge, style-card refreshes, reply retries and paced bubbles. There is no second
conversation scheduler or additional prompt layer. See `src/server/bot/README.md` for the exact
source commit and the limited adaptations at the application boundary.

## Match lifecycle

Bun phases remain waiting → ready → opening → opening_ai → chat → verdict → complete, with
abandoned/failed exits. The bot's opening can reveal a held human reply alongside its answer, or
enter chat first from a developed draft / 40 seconds of silence. Bun accepts the worker's chat start
timestamp and 90-second deadline. Only the worker's new AI message IDs are appended; repeated
snapshots cannot duplicate output. Human public messages are accepted immediately by Bun. A
submitted opening stays private until the worker publishes it, including races with early attack.

Chat expiry and early verdict stop the worker and abort pending HTTP calls. Late worker events
cannot alter a closed match. Anonymous HttpOnly session cookies own seats, so reconnects/refreshes
resume the same match and bot. Explicit leave abandons. Server restarts mark unfinished matches as
technical failures and preserve conservative charges for in-flight requests.

Browser drafts use the reference client's 120 ms debounce in opening and live states. Only the human
contestant can submit drafts. Text is transient in the worker; public DTOs and saved matches never
include it. The current timezone, weekday, local time and device hints are passed privately. The
worker's original clock context handles date questions. Unsent drafts are shared with OpenRouter.

## Accounting and secrets

OpenRouter key stays in Bun's server environment. The worker receives no provider credentials. HTTPS
uses the fixed OpenRouter endpoint and the pinned Haiku model routed to Anthropic without fallback
providers. Chat generation retains 400 max output tokens; style analysis retains 500. Each retry and
hedge independently reserves and settles usage. Unknown or canceled usage retains its conservative
charge. Prompt bytes plus protocol overhead bound input without trimming the original
prompt/context. Actual provider usage reconciles the bound.

Admission reserves 75,000 input / 5,120 output tokens. Requests atomically top up that reservation
when necessary under the existing daily caps (1,000,000 input / 100,000 output by default). There is
no ten-request behavior cutoff. All top-ups remain on the admission UTC day, including after
midnight. Closing a room releases only unused capacity. Token exhaustion and invalid credentials end
as technical failures, never wins.

## Deployment and UI

A single Fly machine is the authority; multi-machine room ownership is not implemented. Production
uses PostgreSQL and requires APP_ORIGIN. The container supplies Python and timezone data; the
reference has no third-party Python dependencies. Fly deployment remains separately gated.

Tailwind v4 uses the Vite plugin and `client/styles.css` for tokens/fonts/global effects. Components
own utility classes. VS Code uses Tailwind language mode. `bun run format` runs Prettier and the
syntax-aware blank-line pass; the pinned Python source is intentionally retained verbatim and
verified by AST hashes. Only transcript history scrolls during active chat.
