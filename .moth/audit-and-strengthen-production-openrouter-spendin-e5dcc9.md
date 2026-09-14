---
id: 'e5dcc9'
title: Audit and strengthen production OpenRouter spending guardrails
status: backlog
priority: urgent
labels:
  - cost
  - production
  - security
created_at: 2026-09-14T19:10:08.952Z
updated_at: 2026-09-14T19:10:08.952Z
---

Production uses the owner's real OpenRouter key. Audit the existing safeguards and close gaps that could allow unexpected spend from ordinary use, concurrent games, abuse or provider failures. Do not assume the current token caps alone provide a sufficient monetary limit.

Acceptance criteria:

- Inventory deployed limits and verify their actual behavior, including admission reservations, daily caps, concurrent matches, retries, hedges, style-analysis calls and missing provider usage.
- Agree on a maximum production spending budget with the owner; verify the production key's provider-side credit/spending limits and document how they interact with application limits.
- Enforce limits server-side and atomically across simultaneous requests. Confirm restart, cancellation, timeout and accounting-recovery paths cannot bypass limits or repeatedly charge unbounded requests.
- Review per-client and global rate/concurrency controls, including anonymous-session churn, and bound automated match creation and request amplification.
- Verify exhaustion and provider failures stop further billable work, present a clear unavailable state and allow controlled recovery.
- Add meaningful regression tests for overspend risks without intentionally generating large production bills. Provide a conservative cost estimate under the configured caps, operational visibility and an emergency procedure to stop AI spending.
- Keep keys, prompts and private drafts out of logs, tickets and committed files.
