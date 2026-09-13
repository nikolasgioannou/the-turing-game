# The Turing Game

A human and an AI compete to convince a human judge. A paired opening, then one minute of free group chat. Public spectators can guess, and completed games have permanent replay links.

## Local development

Use the existing mise-selected Bun. No global installs are needed.

```sh
BUN_INSTALL_CACHE_DIR="$PWD/.cache/bun" bun install --frozen-lockfile
cp .env.example .env # only when .env does not already exist
bun run dev
```

Open http://localhost:5173. Use separate browsers/profiles/devices for the two human roles. Two tabs in the same browser session cannot take both seats. Development uses project-local PGlite (PostgreSQL WASM) and explicitly labeled mock AI. A refresh/disconnect forfeits a playing seat by design. Spectators can reopen a match link.

To use live AI, put `AI_API_KEY` in `.env` and set `AI_MODE=live`. Keep `APP_ORIGIN` equal to the exact browser origin. Never put secrets in a `VITE_` variable. To use an existing PostgreSQL database locally, set `DATABASE_URL`; otherwise PGlite stores data in `data/postgres`.

```sh
bun run check           # TypeScript, engine/SQL tests, production build
bun run test:e2e        # isolated human, judge, spectator Chrome sessions
bun run format:check
```

Browser tests use installed Chrome on this Mac. Elsewhere, install the test browser project-locally:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/ms-playwright" bun run playwright install chromium
```

Do not use `--with-deps` without permission: that can install system packages. Browser profiles and caches are temporary/project-local. No live API calls happen in automated tests.

A manual `bun scripts/smoke-ai.ts` performs three small live requests using `.env`; use `PGLITE_PATH=./work/live-ai-postgres` to isolate its usage ledger. It prints the test prompts, responses and token usage, never credentials.

## Documentation

- [Product decisions](docs/product.md)
- [Architecture](docs/architecture.md)
- [Fly deployment and operations](docs/deployment.md)
- [Progress and remaining work](docs/progress.md)
- [Agent instructions](AGENTS.md)

## What ships

Role matchmaking, invite-only seats with public spectating, hidden A/B identities, a simultaneous opening and timed group chat, spectator guesses, optional judge reasoning, saved transcripts/replays, independent token budgets and provider-failure states. No accounts, spectator chat, model-training pipeline or multi-machine room coordination.

## AI SDK DevTools

Local model calls use Vercel AI SDK `generateText`. To inspect prompts, the current human answer, revealed history, raw provider payloads, output, token usage and latency:

1. Set `AI_DEVTOOLS=true` in your project `.env` and restart the game server.
2. Run `bun run devtools` from this project.
3. Open http://localhost:4983 on your Mac and select a run, then expand its step. Live game generations and manual smoke checks are grouped by match ID.

The Wi-Fi game can remain at http://192.168.1.233:3001. Only the DevTools viewer is restricted to localhost; other players cannot inspect hidden inputs through it. Set `AI_SDK_DEVTOOLS_PORT` consistently on both the game and viewer if changing its default port.

Traces start when enabled; older games are not backfilled. `.devtools/generations.json` stays inside this project and is excluded from git and Docker. Disable `AI_DEVTOOLS` in production; the app rejects production startup with tracing enabled. The DevTools package is development-only and imported only for enabled local calls. The game still enforces its own durable token ledger and makes no automatic SDK retries.

For the downloaded Mac model, run `bun run ai:local` and then `bun run start:local`. See docs/local-ai.md for Wi-Fi configuration and setup.
