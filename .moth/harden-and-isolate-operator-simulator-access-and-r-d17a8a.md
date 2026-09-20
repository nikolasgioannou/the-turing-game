---
id: 'd17a8a'
title: Harden and isolate operator simulator access and resource use
status: done
priority: high
labels:
  - security
created_at: 2026-09-19T23:51:16.397Z
updated_at: 2026-09-20T05:33:00.609Z
---

The production simulator is enabled by SIM_KEY and shares game resources and provider credit. Its authorization also accepts a key in URL query parameters.

Acceptance criteria:

- Accept simulator credentials through headers only; remove query-string key authorization and update dashboard usage.
- Ensure simulation cannot consume player-reserved capacity or bypass concurrency controls.
- Define a safe disabled/paused operating policy when player demand is high.
- Verify unauthorized requests cannot run simulations, read traces or modify scenarios.
- Keep simulator results excluded from public scores and avoid exposing keys in browser history, logs or links.

Implementation/review outcome:

Product/technical policy: keep the simulator local-only for now. Production mounts neither simulator API nor dashboard even with SIM_KEY configured, and deployment no longer stages that key. This removes competition for production player slots and credit. Local API credentials are header-only; the dashboard uses bounded polling and tab-scoped storage rather than a URL key/EventSource. Added lane-count validation. Unit and real HTTP tests verify header access, URL-key rejection and disabled production policy; existing simulation scoring/capacity controls remain. Do not restore production simulations without a separate isolation plan.
