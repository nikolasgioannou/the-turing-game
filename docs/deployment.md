# Fly deployment and operations

## Production infrastructure

The app is `the-turing-game` in the `the-turing-game` organization, with public origin https://the-turing-game.fly.dev and primary region `iad` (Virginia). Provisioning was approved by the owner. Deployment validation is recorded in docs/progress.md.

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
curl --fail https://the-turing-game.fly.dev/api/health
```

No local Docker installation is required. Inspect Fly logs when a health check or startup fails. After infrastructure changes, run a real two-participant game and a separate homepage session, verify an outcome, then restart when no players are active and verify the outcome and usage accounting remain intact.

## Usage model

Daily token caps are enforced atomically. Initial admission reserves 75,000 input / 5,120 output tokens; each provider attempt reserves its actual conservative input-byte bound and 400 chat / 500 analyst output tokens, topping up only within the daily cap. Retries and hedges count separately. Unknown/canceled usage remains conservatively charged; measured usage reconciles it. Reservations stay on the admission UTC day. Chat closure releases unused capacity and cancels workers/requests.

## Operational commands

Run inside the app environment or locally against the intended DATABASE_URL:

```sh
bun scripts/ops.ts usage
bun scripts/ops.ts resume-ai
```

`usage` shows seven days of counters and availability state. It does not expose transcripts/keys. `resume-ai` clears the provider circuit after credits/credentials/provider outage are fixed. It does not bypass token caps. No user-facing admin controls.

Provider authentication/credit failures end the affected match as a technical failure. Transient completion failures retain the bot's retry/fallback behavior. Exhausted daily capacity blocks new admission and new requests, without counting a match result.

## Limitations

- App instance is single-authority and not highly available; PostgreSQL high availability does not change that.
- Local PGlite tests do not verify Fly networking, credentials, remote connection pooling or the production container. Validate these on deployment.
- Secrets, `.env` files, browser profiles, caches and local data are excluded from Git and the Docker context.
