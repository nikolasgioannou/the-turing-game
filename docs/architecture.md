# Architecture

React, Vite and Tailwind client; Bun HTTP/WebSocket authority; PostgreSQL in production and project-local PGlite in development. Shared Zod schemas validate public socket commands.

## Boundaries

- `shared/protocol.ts`: browser-safe limits, types and explicit public views.
- `shared/commands.ts`: server-only Zod command validation.
- `server/database.ts`: PostgreSQL/PGlite adapters.
- `server/store.ts`: snapshots, request ledger, daily capacity and reservations.
- `server/game.ts`: sessions, matchmaking, deadlines, scoring and public serialization.
- `server/ai.ts`: private worker lifecycle and OpenRouter transport/accounting.
- `server/bot`: TypeScript conversation engine, private transport and behavior fixtures.
- `client/ui`: shared controls and layouts with static Tailwind classes.

One isolated Bun worker per match runs the conversation scheduling loop. JSON lines carry game input and private drafts into it, and public transcript updates/provider requests out. Bun routes requests to OpenRouter and returns the text in the response shape expected by the bot. No direct Anthropic SDK or local inference dependency is needed. Worker diagnostics are suppressed; prompts, drafts and style cards are not written to application logs.

The bot owns all AI decisions, including its 400 ms loop, live draft planning, opening attack, 2.5-second request hedge, style-card refreshes, reply retries and paced bubbles. There is no second conversation scheduler or additional prompt layer. See `src/server/bot/README.md` for bot behavior and application boundaries.

## Match lifecycle

Bun phases remain waiting → ready → opening → opening_ai → chat → verdict → complete, with abandoned/failed exits. The bot's opening can reveal a held human reply alongside its answer, or enter chat first from a developed draft / 40 seconds of silence. Bun accepts the worker's chat start timestamp and 90-second deadline. Worker snapshots publish AI and held opening messages without duplicates. Live human and judge messages are accepted immediately by Bun. Both players may continue during opening; a second human submission releases the previous held one. The latest opening stays private until worker publication, including early-attack races.

Chat expiry and early verdict stop the worker and abort pending HTTP calls. Late worker events cannot alter a closed match. Anonymous HttpOnly session cookies own seats, so reconnects/refreshes resume the same match and bot. Explicit leave abandons. Server restarts mark unfinished matches as technical failures and preserve conservative charges for in-flight requests.

Browser drafts use the client's 120 ms debounce in opening and live states. Only the human contestant can submit drafts. Text is transient in the worker; public DTOs and saved matches never include it. Names are collected on entry; timezone, weekday, local time and device hints are passed privately on entry/reconnect. Human names never enter public DTOs; the judge name is public. The worker's original clock context handles date questions. Unsent drafts are shared with OpenRouter.

## Accounting and secrets

OpenRouter key stays in Bun's server environment. The worker receives no provider credentials. HTTPS uses the fixed OpenRouter endpoint and the pinned Haiku model routed to Anthropic without fallback providers. Chat generation retains 400 max output tokens; style analysis retains 500. Each retry and hedge independently reserves and settles usage. Unknown or canceled usage retains its conservative charge. Prompt bytes plus protocol overhead bound input without trimming the original prompt/context. Actual provider usage reconciles the bound.

Admission reserves 75,000 input / 5,120 output tokens. Requests atomically top up that reservation when necessary under the existing daily caps (1,000,000 input / 100,000 output by default). There is no ten-request behavior cutoff. All top-ups remain on the admission UTC day, including after midnight. Closing a room releases only unused capacity. Token exhaustion and invalid credentials end as technical failures, never wins.

## Deployment and UI

A single Fly machine is the authority; multi-machine room ownership is not implemented. Production uses PostgreSQL and requires APP_ORIGIN. The container runs Bun only, including the conversation engine and timezone handling. Fly deployment remains separately gated.

Tailwind v4 uses the Vite plugin and `client/styles.css` for tokens/fonts/global effects. Components own utility classes. VS Code uses Tailwind language mode. `bun run format` runs Prettier and the syntax-aware blank-line pass; bot behavior is verified by deterministic fixtures and prompt hashes. Only transcript history scrolls during active chat.

Score aggregates are cached in the game authority until a terminal match save; unchanged lobby ticks do not scan transcript history. Names/device context do not spawn workers. Context updates after chat ends are rejected, and the latest opening remains held until its own publication.
