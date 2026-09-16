# The Turing Game

A human and an AI compete to convince a judge. Find the human during a 90-second group chat. Matches are visible only to their two participants. Results remain on screen until you return to the lobby.

## Development

Use the project's Bun version. The application and conversation engine are TypeScript; inference runs exclusively through OpenRouter.

```sh
bun install --frozen-lockfile
cp .env.example .env # only if .env does not already exist
# Add OPENROUTER_API_KEY to .env
bun run dev
```

Open http://localhost:5173. Vite hot-reloads the UI and proxies API/WebSocket requests to the watched Bun server on port 3000. Both servers listen only on loopback interfaces. Ctrl+C stops both. Use separate browser profiles for the two human roles. Refresh restores your seat; the game clock continues while disconnected. Server code changes restart the backend and end active matches. Development always uses local PGlite storage in `data/local`.

`bun run dev` sets its own local ports, origin and storage; it does not use `DATABASE_URL`. The separate `dev:client` / `dev:server` commands are available when needed; set the server's `APP_ORIGIN=http://localhost:5173` when running them together.

`bun run build && bun run start` serves the built app at http://localhost:3000. Set `DATABASE_URL` to use PostgreSQL; otherwise development storage uses `PGLITE_PATH`. Production requires `DATABASE_URL` and `APP_ORIGIN`. Never put credentials in client code or `VITE_` variables.

## Simulator

Set `SIM_KEY` in `.env` (and on production as a Fly secret) to enable an operator-only simulator at `/sim`; on the site, Cmd/Ctrl+Shift+= opens it. It runs several matches at once with a scripted judge and a scripted human replaying recorded conversations, so the bot can be watched live, with its full decision trace (every model attempt, every filter that fired, what was finally sent), and rerun with any scenario. At the end of each lane an independent AI judge reads the transcript with labels only, picks the bot and states the strongest tell; that verdict is the evaluation. Simulated matches are invisible to players, never count toward the score, make real OpenRouter calls under the configured key’s spending limit and availability checks. Scenarios are stored in the database; paste them in from the Scenarios panel. `bun run sim:extract <dir>` turns saved transcripts into that JSON without committing private conversations.

## Bot behavior

The bot uses Claude Haiku 4.5 with response planning, style analysis, draft handling, hedged requests, normalization and pacing. It can send before the human and adapt to unsent drafts. OpenRouter receives that context; application storage does not retain unsent drafts. See [bot architecture and behavior](src/server/bot/README.md).

The model is pinned to `anthropic/claude-haiku-4.5` through OpenRouter's Anthropic provider. Configure `OPENROUTER_API_KEY` in `.env`, then restart. No local model or mock-provider path remains.

```sh
bun run check         # TypeScript, unit/worker/integrity checks, production build
bun run test:e2e      # real OpenRouter calls and isolated Chrome sessions
bun run format:check
```

Browser tests use installed Chrome on this Mac. Model output is stochastic; behavior integrity is verified separately from response quality. Keys, databases, generated files and caches stay out of git and Docker's build context.

## Documentation

- [Product](docs/product.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Progress](docs/progress.md)
- [Issue tracking](docs/issues.md)
- [Component library](src/client/ui/README.md)

## UI review

Run `bun run review` and open http://localhost:5174/review to inspect fixed UI states without playing a game. Run `bun run review:capture` to export desktop/mobile screenshots and an HTML contact sheet. See [UI review](docs/ui-review.md).
