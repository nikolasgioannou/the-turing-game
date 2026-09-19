---
id: 'd17a8a'
title: Harden and isolate operator simulator access and resource use
status: backlog
priority: high
labels:
  - security
created_at: 2026-09-19T23:51:16.397Z
updated_at: 2026-09-19T23:51:16.397Z
---

The production simulator is enabled by SIM_KEY and shares game resources and provider credit. Its authorization also accepts a key in URL query parameters.

Acceptance criteria:

- Accept simulator credentials through headers only; remove query-string key authorization and update dashboard usage.
- Ensure simulation cannot consume player-reserved capacity or bypass concurrency controls.
- Define a safe disabled/paused operating policy when player demand is high.
- Verify unauthorized requests cannot run simulations, read traces or modify scenarios.
- Keep simulator results excluded from public scores and avoid exposing keys in browser history, logs or links.
