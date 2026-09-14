# The Turing Game

A human and an AI compete to convince a judge. Find the AI during a 90-second group chat. Completed
matches have permanent replay links.

## Development

Use the project's Bun version and an existing Python 3.9+ runtime. Python runs the reference bot's
conversation logic; inference runs exclusively through OpenRouter. No Python packages are required.

```sh
bun install --frozen-lockfile
cp .env.example .env # only if .env does not already exist
# Add OPENROUTER_API_KEY to .env
bun run dev
```

Open http://localhost:3000. For a friend on the same Wi-Fi, share this computer's LAN address on
port 3000. Use different browsers/profiles/devices for the two human roles. Refresh restores your
seat; the game clock continues while disconnected. Development uses PGlite in `data/wifi`.

`bun run build && bun run start` serves a production build. Set `DATABASE_URL` to use PostgreSQL;
otherwise development storage uses `PGLITE_PATH`. Production requires `DATABASE_URL` and
`APP_ORIGIN`. Never put credentials in client code or `VITE_` variables. `BOT_PYTHON` optionally
selects an existing Python runtime.

## Bot behavior

The bot is copied from [mbaghadjian/turing-game](https://github.com/mbaghadjian/turing-game) at
`a2bc11ac8e62b2a9560d2895cdd3adfe9ddc13dc`: same prompts, Claude Haiku 4.5, response planning, style
analysis, draft handling, hedged requests, normalization and pacing. It can send before the human
and adapt to unsent drafts. OpenRouter receives that context; application storage does not retain
unsent drafts. See [provenance and integration details](src/server/bot/README.md).

The model is pinned to `anthropic/claude-haiku-4.5` through OpenRouter's Anthropic provider.
Configure `OPENROUTER_API_KEY` in `.env`, then restart. No local model or mock-provider path
remains.

```sh
bun run check         # TypeScript, unit/worker/parity checks, production build
bun run test:e2e      # real OpenRouter calls and isolated Chrome sessions
bun run format:check
```

Browser tests use installed Chrome on this Mac. Model output is stochastic; source parity is
verified separately from response quality. Keys, databases, generated files and caches stay out of
git and Docker's build context.

## Documentation

- [Product](docs/product.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Progress](docs/progress.md)
- [Component library](src/client/ui/README.md)
