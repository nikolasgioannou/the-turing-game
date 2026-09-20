---
id: 'a5b7a7'
title: Measure supported concurrency with controlled load tests
status: backlog
priority: high
labels:
  - performance
created_at: 2026-09-19T23:51:16.474Z
updated_at: 2026-09-20T01:23:21.174Z
---

Recommendation: defer broader load testing while retaining the current 20-game cap on the single 2 GB Fly machine. Revisit if traffic exposes latency, memory or admission issues, or before raising the cap.

Existing evidence:

- A controlled 97-second Fly run exercised 20 real bot workers, reaching chat and verdict. An extra pair waited and entered after a slot was released.
- Sampled machine-wide memory use peaked at 479 MiB, with 1,490 MiB available. Serialized actions measured 12.48 ms p95 and 612.57 ms maximum, including queue wait and worker startup.
- The harness used controlled completions and an in-memory store. It excluded HTTP/WebSocket transport, real OpenRouter latency and production PostgreSQL, and did not cover sustained repeated rounds or subsequent code changes. See docs/progress.md.
- This is sufficient initial evidence for starting at 20, not a full production capacity guarantee or representative model-cost measurement.

Scope when revisited:

- Design repeatable isolated scenarios for idle visitors, simultaneous games, admission bursts and reconnect storms.
- Measure memory, CPU, event-loop delay, outbound events, model concurrency and player-visible latency, including sustained rounds and worker cleanup.
- Exercise capacity limits, dependency failures and recovery without stressing production users.
- Use controlled completions for broad tests and explicitly bounded provider-backed checks only when authorized.
- Publish the tested environment, limits, bottlenecks and configuration; do not claim unmeasured capacity.

Keep in backlog; this recommendation does not authorize additional tests or infrastructure spending.
