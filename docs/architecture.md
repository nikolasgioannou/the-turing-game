# Architecture

React, Vite and Tailwind client; Bun HTTP/WebSocket authority; PostgreSQL in production and project-local PGlite in development. Shared Zod schemas validate public socket commands.

## Boundaries

- `shared/protocol.ts`: browser-safe limits, types and explicit public views.
- `shared/commands.ts`: server-only Zod command validation.
- `server/database.ts`: PostgreSQL/PGlite adapters.
- `server/store.ts`: minimal match outcomes.
- `server/game.ts`: sessions, matchmaking, deadlines, scoring and public serialization.
- `server/ai.ts`: private worker lifecycle and OpenRouter transport.
- `server/provider-availability.ts`: single-flight key-status refresh, 30-second cache and immediate credit-exhaustion updates.
- `server/bot`: TypeScript conversation engine, private transport and behavior fixtures.
- `client/ui`: shared controls and layouts with static Tailwind classes.

One isolated Bun worker per match runs the conversation scheduling loop. JSON lines carry game input and private drafts into it, and public transcript updates/provider requests out. Bun routes requests to OpenRouter and returns the text in the response shape expected by the bot. No direct Anthropic SDK or local inference dependency is needed. Worker diagnostics are suppressed; prompts, drafts and style cards are not written to application logs.

The bot owns all AI decisions, including its 400 ms loop, live draft planning, opening attack, 2.5-second request hedge, style-card refreshes, reply retries and paced bubbles. There is no second conversation scheduler or additional prompt layer. See `src/server/bot/README.md` for bot behavior and application boundaries.

## Match lifecycle

Bun phases remain waiting → ready → opening → opening_ai → chat → verdict → complete, with abandoned/failed exits. The bot's opening can reveal a held human reply alongside its answer, or enter chat first from a developed draft / 40 seconds of silence. Bun accepts the worker's chat start timestamp and 90-second deadline. Worker snapshots publish AI and held opening messages without duplicates. Live human and judge messages are accepted immediately by Bun. Both players may continue during opening; a second human submission releases the previous held one. The latest opening stays private until worker publication, including early-attack races.

Chat expiry and early verdict stop the worker and abort pending HTTP calls. Late worker events cannot alter a closed match. Anonymous HttpOnly session cookies own seats, so reconnects/refreshes resume the same match and bot. Explicit leave abandons. Server restarts end unfinished in-memory matches without counting a result.

Browser drafts use the client's 120 ms debounce in opening and live states. Only the human contestant can submit drafts. Text is transient in the worker; participant DTOs and the database never include it. Names are collected on entry; timezone, weekday, local time and device hints are passed privately on entry/reconnect. Human names never enter public DTOs; the judge name is public. The worker's original clock context handles date questions. Unsent drafts are shared with OpenRouter.

## Provider requests and secrets

The OpenRouter key stays in Bun's server environment; workers receive no provider credentials. HTTPS uses the fixed OpenRouter endpoint and the pinned Haiku model routed to Anthropic without fallback providers. Chat generation retains 400 max output tokens; style analysis retains 500. Timeouts, retries and hedges remain part of bot behavior. Each attempt checks that its match is still active before dispatch; closing chat cancels pending calls.

OpenRouter owns spending limits. The server caches key availability for 30 seconds and rejects new matches when credit is exhausted or status cannot be verified. Model HTTP 402 responses immediately update the cache, even if an older positive status check is still in flight. The next game tick stops active games and clears queues; verdict-ready games can finish. Failed status refreshes preserve known exhaustion. Provider checks run outside the game tick; admission refreshes coalesce with those checks.

There are no local spending budgets, usage counters, reservations or network match quotas. Provider failures remain technical failures, never wins. The app does not read or write the former accounting tables.

## Deployment and UI

A single Fly machine is the authority; multi-machine room ownership is not implemented. Production uses PostgreSQL and requires APP_ORIGIN. The container runs Bun only, including the conversation engine and timezone handling. See docs/deployment.md for production infrastructure and the manual GitHub deployment workflow.

Tailwind v4 uses the Vite plugin and `client/styles.css` for tokens/fonts/global effects. Components own utility classes. VS Code uses Tailwind language mode. `bun run format` runs Prettier and the syntax-aware blank-line pass; bot behavior is verified by deterministic fixtures and prompt hashes. Only transcript history scrolls during active chat.

Score aggregates are cached in the game authority until a terminal match outcome is saved. The match_outcomes table stores only the match ID and whether AI won. Transcripts stay in memory, with no match listing or saved-game endpoint. Names/device context do not spawn workers. Context updates after chat ends are rejected, and the latest opening remains held until its own publication.

Postgame friend rematch preferences stay in the completed in-memory match. The rematch command requires an authenticated participant, a terminal friend match and a present peer still on that result screen. Both preferences must be compatible before newMatch applies the provider credential and cached credit availability checks. Neither an offer nor cancellation starts inference or saves another outcome. Leaving/disconnection clears consent; completed matches are not restored on reconnect. Public replay uses the existing queue path.

Unavailable status clears queued roles, including when the provider check fails; existing games stop only on confirmed exhaustion. Lobby availability can include an expected reset timestamp from a confirmed exhausted key with a known reset period. A model 402 clears this hint because it may reflect account credit instead. The client remembers queue interruption and availability recovery without automatically requeueing.

`Game.newMatch` enforces `MAX_ACTIVE_GAMES` after the provider availability check, before inserting a room. Every nonterminal room counts, so invitations reserve slots and reconnects do not allocate another. Queue matching uses arrival order among compatible participants and resumes on game ticks; canceled/disconnected peers are excluded. Friend rematches and simulator rooms use the same admission guard.
