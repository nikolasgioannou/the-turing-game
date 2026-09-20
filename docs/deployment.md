# Fly deployment and operations

## Production infrastructure

The app is `the-turing-game` in the `the-turing-game` organization, with public origin https://theturinggame.ai and primary region `iad` (Virginia). Provisioning was approved by the owner. Deployment validation is recorded in docs/progress.md.

One always-on Bun app machine connects to Fly Managed Postgres cluster `turing-production` (`dzx6qo65n8g0jpv5`) in the same region. The approved Basic plan costs $38/month plus $2.80/month for 10 GB provisioned storage, excluding application hosting and OpenRouter usage. Pricing was verified during provisioning on 2026-09-14. There is no app volume or Python runtime; OpenRouter handles all model inference.

Keep exactly one app machine. Deploy with `--ha=false --strategy immediate`; overlapping servers do not share live rooms. Scale-out is unsupported until room ownership/shared matchmaking is implemented. App restarts and deployments end active matches. PostgreSQL preserves outcomes, not conversations.

## Manual GitHub deployment

Open the repository’s Actions tab, select **Deploy production**, click **Run workflow**, and choose `main`. Pushes do not deploy automatically. Other branches are skipped. Runs are serialized without canceling an in-progress deployment.

The workflow installs the package.json Bun version, verifies the lockfile, checks formatting/types/tests/build, then uses Fly’s remote builder and checks the public health endpoint. GitHub actions are pinned to commit hashes and flyctl is pinned to 0.4.102. The production job uses a GitHub environment named `production`.

The environment secret `FLY_API_TOKEN` holds an app-scoped deployment token. It was created with Fly’s default 20-year lifetime on 2026-09-14; Fly does not document a never-expiring deployment token. Rotate it by creating a replacement deploy token and updating this environment secret. Do not use an organization-wide or personal login token.

Application secrets belong in Fly: `DATABASE_URL` is provided by the managed database attachment, and `OPENROUTER_API_KEY` must be a separate production key. The workflow does not need either application credential. Never commit keys or connection strings. Local `.env.production` is ignored by Git and excluded from the Docker build context.

## Direct deployment and checks

From the project directory with flyctl authenticated:

```sh
bun run format:check
bun run check
fly config validate
fly deploy --remote-only --ha=false --strategy immediate
fly status
fly checks list
curl --fail https://theturinggame.ai/api/health
```

No local Docker installation is required. Inspect Fly logs when a health check or startup fails. After infrastructure changes, run a real two-participant game and a separate homepage session, verify an outcome, then restart when no players are active and verify the outcome remains intact.

## AI usage

Configure the production key’s spending limit and reset period in OpenRouter. The server reads GET /api/v1/key with that same key, caching availability for 30 seconds; no management key is needed. A zero or negative limit_remaining blocks new games. An explicitly unlimited key is allowed, so set a provider limit if you want spending capped. No dollar amounts or credentials are sent to players.

An HTTP 402 from a model call immediately marks capacity unavailable, prevents retries for that error and ends affected active games without scoring. The server cancels pending bot work and clears queued players. It rechecks OpenRouter automatically, resuming admission when credit is available. Games already awaiting a verdict may finish because they need no more AI calls. A positive cached balance does not guarantee enough credit to finish a game; OpenRouter enforces spending.

Failed or malformed status checks temporarily block new games but do not interrupt existing chats unless exhaustion is known. Known exhaustion remains unavailable through check failures. The app has no separate daily dollar/token caps, accounting ledger or per-network match quota. Old cap and kill-switch environment variables are ignored.

Existing daily_usage, reservations, ai_requests and service_state tables are no longer read or written. This change does not delete existing database records. Match outcomes and simulator scenarios remain in use.

## Simulator

`SIM_KEY` enables `/sim` and `/api/sim/*`; without it the routes do not exist. The dashboard asks for the key once per browser. `SIM_LANES` sets the initial lane count. Simulated matches and their judge evaluations make real OpenRouter calls and share the production key’s availability checks. They are never saved as outcomes and are not visible to players. Set the key with `fly secrets set SIM_KEY=<long random string> -a the-turing-game`.

Provider authentication/credit failures end the affected match as a technical failure. Credit-exhaustion failures also mark capacity unavailable until a later provider check reports credit. Transient completion failures retain the bot's retry/fallback behavior. Chat closure cancels workers and pending requests.

## Limitations

- App instance is single-authority and not highly available; PostgreSQL high availability does not change that.
- Local PGlite tests do not verify Fly networking, credentials, remote connection pooling or the production container. Validate these on deployment.
- Secrets, `.env` files, browser profiles, caches and local data are excluded from Git and the Docker context.

## Custom domain

Spaceship DNS points `theturinggame.ai` at Fly using A `66.241.125.138` and AAAA `2a09:8280:1::18e:4abf:0`. Fly manages the HTTPS certificate. `APP_ORIGIN` must match this public origin for WebSocket authentication and invitation links. Production page requests on the old Fly hostname redirect to the canonical domain; API health checks remain available without a redirect. The www hostname is not configured.

## Concurrent game limit

`MAX_ACTIVE_GAMES` defaults to 20 and must be a positive integer. Set it in `.env` for local development and restart the server. For production, edit `[env].MAX_ACTIVE_GAMES` in `fly.toml` and deploy. The limit is per process and assumes the current single-machine authority. All unfinished rooms reserve a slot, including invitations, verdicts and simulator rooms. Public players wait in the existing queue and are matched on the next tick when space opens. Full friend creation/rematch and simulator attempts receive a retry message; joining an existing invitation uses its reserved slot. This is a concurrency limit, not a spending cap or a measured capacity guarantee.

Connection limiting uses Fly-Client-IP only when running on Fly and the transport peer is on Fly's private fdaa IPv6 or 172.16.0.0/12 IPv4 network. Public traffic must enter through the configured Fly HTTP service; organization-private callers are trusted. Direct/local traffic uses the socket address, and arbitrary X-Forwarded-For headers are ignored. Do not expose this listener directly or place an untrusted proxy inside that trust boundary. Equivalent IPv6 and IPv4-mapped addresses share a limiter bucket. Fly's header contract is documented at https://fly.io/docs/networking/request-headers/.
