# Conversation engine

`brain.ts` owns prompts, style analysis, response planning, normalization and delivery pacing. `constants.ts` owns the system prompt and response patterns. Deterministic fixtures check planning, style adaptation, filtering and exact request-prompt hashes. Update these checks deliberately when changing behavior.

The bot aims to be selected as the human. It mirrors writing style without automatically copying refusals or opinions. Subjective comparisons call for a clear, consistent position; provocative questions call for brief, non-graphic replies rather than blanket dismissals.

## Runtime and transport

- Each match has an isolated Bun/TypeScript worker. Bun owns sessions, matchmaking, public views, persistence, scoring, admission limits and provider credentials.
- The model is `anthropic/claude-haiku-4.5` through OpenRouter, routed to Anthropic with provider fallbacks disabled. Thinking is disabled; no temperature override is applied. Chat calls allow 400 output tokens and style analysis 500.
- Chat requests have a six-second timeout, one transient retry and a second hedged call after 2.5 seconds. Style analysis has a 20-second timeout. Every actual call is accounted separately.
- `worker.ts` communicates through private JSON lines. Credentials and HTTPS requests remain in the parent server. Workers disable dotenv loading and receive only an explicit environment; no local inference runs.
- Retry handling honors retry-after-ms, retry-after and x-should-retry with jittered backoff. Successful accounting does not delay response delivery. Reservations are required before dispatch.

## Conversation and privacy

The engine controls opening replies, its 400 ms decision loop, draft planning, style-card refreshes, response filtering, retries and paced messages. Both humans may continue messaging during opening. Held messages are published in order. The bot can start chat before the human sends; its first reply starts the 90-second chat. Visible typing indicators are off.

Drafts use a 120 ms debounce in opening and live chat and clear immediately on submission. Names are collected at entry. The judge name is public; the human name is private context. Browser timezone, weekday, time and device hints are refreshed on entry/reconnect, with lowercase mobile booleans.

Drafts and style cards are transient and sent to OpenRouter. They are not retained in application logs, database records or public views. Verbose worker logs are suppressed because they include private text. Socket refresh preserves the bot; closing chat kills the worker and cancels pending HTTP calls so late responses cannot be delivered.

Message-size, human-action timeout and daily-token limits apply at the application boundary. Budget exhaustion or credential failure ends a match as a technical failure. Transient generation failures use the engine's retry/fallback behavior.

## Validation

Run `bun test` for behavior integrity, deterministic scheduling, the TypeScript worker with controlled HTTP transport, and game/store/adapter regressions. `bun run test:e2e` requires an OpenRouter key and makes paid model calls. Model output and network latency are stochastic.
