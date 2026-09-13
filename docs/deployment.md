# Fly deployment and operations

## Deployment gate

The owner explicitly asked us to pause before Fly provisioning/deployment so they can supply more details. Do not create an app/database, configure paid services or deploy until that discussion occurs. The local app is independently testable. The owner will install/sign into flyctl; do not install it globally for them.

Finalize organization, available app name, region, Managed Postgres plan and domain. The checked-in app name/origin and iad region are proposed values, not proof of a reserved app. Fly Managed Postgres Basic was documented at $38/month plus storage when checked on 2026-09-13; verify again before provisioning.

## Target topology

One always-on Bun app machine + Fly Managed Postgres in the same region. No app volume. Fly defaults can create extra Machines: use `fly deploy --ha=false` for the first deployment and verify exactly one app machine. Keep immediate deployment strategy; overlapping servers must not each recover the other's rooms. Scale-out is explicitly unsupported until room ownership/shared matchmaking is implemented. App restarts end active matches as technical failures.

## After owner supplies deployment details

1. Verify Fly login and organization, app name and region.
2. Create the approved app and Managed Postgres cluster; attach its database so Fly provides `DATABASE_URL`. Use Fly's current `fly mpg --help` and official create/attach docs; never provision legacy unmanaged Fly Postgres by mistake.
3. Set `AI_API_KEY` as a Fly secret without echoing it or putting it in shell history. Confirm `AI_MODE=live`, `AI_MODEL`, exact HTTPS `APP_ORIGIN`, and token caps.
4. Run local checks and `fly config validate`. Use a remote builder if Docker is not installed locally. No global Docker install is necessary.
5. Deploy with one machine. Check logs and `/api/health`, confirm real PostgreSQL schema/data, and run a real three-session smoke test.
6. Restart once when no real players are active, verify replay persistence and usage accounting, and document the live URL.

## Usage model

Per-day input and output ceilings are app-owned, independently of OpenRouter. Each match reserves 200,000 input + 2,560 output tokens (40,000/512 per round). This is deliberately conservative: no more than five maximum-reservation matches can begin concurrently at the initial input cap. Actual reported usage releases the difference. Unused rounds release their reservation at termination; unknown/failed request usage stays charged at its maximum.

Reservations belong to the UTC day on which the match is admitted. A match finishing after midnight consumes its prior-day allowance. Daily resets never release capacity belonging to running games. A maximum of five requests per match and fixed per-request output limits bound consumption. Adding retries or another tokenizer requires updating reservations and tests first.

## Operational commands

Run inside the app environment or locally against the intended DATABASE_URL:

```sh
bun scripts/ops.ts usage
bun scripts/ops.ts resume-ai
```

`usage` shows seven days of counters and availability state. It does not expose transcripts/keys. `resume-ai` clears the provider circuit after credits/credentials/provider outage are fixed. It does not bypass token caps. No user-facing admin controls.

Provider authentication/credit errors pause new games for 24 hours (or until operator resume); transient provider errors pause for a minute. In-flight failed games preserve transcripts and do not count as wins. If the daily allowance is exhausted, viewing and replay still work, and matchmaking explains the reset time.

## Limitations to keep explicit

- App instance is single-authority and not highly available; PostgreSQL high availability does not change that.
- Anonymous spectator votes are per browser session, not resistant to someone creating many identities.
- PGlite tests execute PostgreSQL semantics but do not verify Fly networking, credentials, remote connection pooling or the production container.
- Secrets, `.env`, test browser binaries, profiles, caches and local data are excluded from git and Docker context.
