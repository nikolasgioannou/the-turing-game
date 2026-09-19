---
id: 'a5b7a7'
title: Measure supported concurrency with controlled load tests
status: backlog
priority: high
labels:
  - performance
created_at: 2026-09-19T23:51:16.474Z
updated_at: 2026-09-19T23:51:16.474Z
---

No safe concurrent-player count has been established for the current one-machine, per-game-worker architecture. Connection limits alone do not demonstrate game capacity.

Acceptance criteria:

- Design repeatable isolated load scenarios for idle visitors, simultaneous games, admission bursts and reconnect storms.
- Measure memory, CPU, event-loop delay, outbound events, model concurrency and player-visible latency.
- Exercise capacity limits, dependency failures, worker cleanup and recovery without stressing production users.
- Use controlled completions for broad load tests and explicitly bounded provider-backed checks only when authorized.
- Publish measured limits, environment, bottlenecks and recommended configuration; do not claim unmeasured capacity.
