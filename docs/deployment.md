# Fly deployment and operations

## Production infrastructure

The app is `the-turing-game` in the `the-turing-game` organization, with public origin https://theturinggame.ai and primary region `iad` (Virginia). Provisioning was approved by the owner. Deployment validation is recorded in docs/progress.md.

One always-on Bun app machine connects to Fly Managed Postgres cluster `turing-production` (`dzx6qo65n8g0jpv5`) in the same region. The approved Basic plan costs $38/month plus $2.80/month for 10 GB provisioned storage, excluding application hosting and OpenRouter usage. Pricing was verified during provisioning on 2026-09-14. There is no app volume or Python runtime; OpenRouter handles all model inference.

Keep exactly one app machine. Deploy with `--ha=false --strategy immediate`; overlapping servers must not each recover the other's rooms. Scale-out is unsupported until room ownership/shared matchmaking is implemented. App restarts and deployments end active matches. PostgreSQL preserves outcomes and usage accounting, not conversations.

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

No local Docker installation is required. Inspect Fly logs when a health check or startup fails. After infrastructure changes, run a real two-participant game and a separate homepage session, verify an outcome, then restart when no players are active and verify the outcome and usage accounting remain intact.

## Usage model

Daily token caps are enforced atomically. Initial admission reserves 75,000 input / 5,120 output tokens; each provider attempt reserves its actual conservative input-byte bound and 400 chat / 500 analyst output tokens, topping up only within the daily cap. Retries and hedges count separately. Unknown/canceled usage remains conservatively charged; measured usage reconciles it. Reservations stay on the admission UTC day. Chat closure releases unused capacity and cancels workers/requests.

## Spending guardrails

Four independent limits bound provider spend. All are enforced server-side inside the same database transactions that admit matches and requests, so simultaneous requests cannot slip past them.

| Limit | Default | Where |
| --- | --- | --- |
| Daily input tokens | `DAILY_INPUT_TOKEN_CAP=1000000` | admission, every request |
| Daily output tokens | `DAILY_OUTPUT_TOKEN_CAP=100000` | admission, every request |
| Daily money, at the pinned model's list price | `DAILY_USD_CAP=2` | admission, every request |
| Matches per network per hour | `MATCHES_PER_IP_PER_HOUR=30` (loopback exempt) | match creation |

Cost estimate at list price for `anthropic/claude-haiku-4.5` ($1 per million input, $5 per million output): the default token caps allow at most **$1.50 per UTC day** (about **$46 per month**), roughly 13 admitted matches per day. Hedged and retried attempts count separately, so exhaustion arrives earlier under bad latency; nothing lets spend exceed the caps. `DAILY_USD_CAP` is a money limit computed from the same counters and is the one to lower if the token caps are ever misconfigured; set it below $1.50 to make money the binding limit.

Application limits are the inner fence. The provider key is the outer fence: keep a credit limit on the production OpenRouter key so a bug in this application cannot spend beyond it, and prefer prepaid credits over an open card. The two do not interact; whichever is reached first stops billable work.

Automatic stops:

- Provider credential or credit failures (HTTP 401/402/403) end the match and pause AI admission for 30 minutes. Without this, every new match would fail and pre-charge the day's cap for nothing.
- Three provider failures of any kind within ten minutes trip a circuit breaker that pauses admission for ten minutes.
- Both pauses expire on their own and show visitors the reason. `resume-ai` clears them early once the cause is fixed.

Emergency stop, in order of speed:

1. `fly secrets set AI_DISABLED=1 -a <app>` refuses every new AI match immediately after the restart it triggers. Existing matches finish or fail; no new requests are admitted. Unset it to resume.
2. `bun scripts/ops.ts pause-ai [minutes] [reason]` pauses admission through the database without a restart (default 24 hours).
3. Revoke or rotate the OpenRouter key; the credential-failure pause then engages automatically.

## Simulator

`SIM_KEY` enables `/sim` and `/api/sim/*`; without it the routes do not exist. The dashboard asks for the key once per browser. `SIM_LANES` sets the initial lane count and `SIM_DAILY_MATCHES` (default 40) bounds simulated matches per day on top of every spending cap. Simulated matches reserve capacity like real ones, are never saved as outcomes, and are not visible to players. Set the key with `fly secrets set SIM_KEY=<long random string> -a the-turing-game`.

## Operational commands

Run inside the app environment or locally against the intended DATABASE_URL:

```sh
bun scripts/ops.ts usage
bun scripts/ops.ts pause-ai [minutes] [reason]
bun scripts/ops.ts resume-ai
```

`usage` shows seven days of counters and availability state. It does not expose transcripts/keys. `pause-ai` stops admitting AI matches for the given number of minutes. `resume-ai` clears any pause, whether operator-set or automatic, after credits/credentials/provider outage are fixed. Neither bypasses token or money caps. No user-facing admin controls.

Provider authentication/credit failures end the affected match as a technical failure and pause admission (see above). Transient completion failures retain the bot's retry/fallback behavior. Exhausted daily capacity blocks new admission and new requests, without counting a match result.

## Limitations

- App instance is single-authority and not highly available; PostgreSQL high availability does not change that.
- Local PGlite tests do not verify Fly networking, credentials, remote connection pooling or the production container. Validate these on deployment.
- Secrets, `.env` files, browser profiles, caches and local data are excluded from Git and the Docker context.

## Custom domain

Spaceship DNS points `theturinggame.ai` at Fly using A `66.241.125.138` and AAAA `2a09:8280:1::18e:4abf:0`. Fly manages the HTTPS certificate. `APP_ORIGIN` must match this public origin for WebSocket authentication and invitation links. Production page requests on the old Fly hostname redirect to the canonical domain; API health checks remain available without a redirect. The www hostname is not configured.
