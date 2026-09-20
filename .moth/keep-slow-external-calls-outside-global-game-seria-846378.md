---
id: '846378'
title: Keep slow external calls outside global game serialization
status: done
priority: high
labels:
  - performance
created_at: 2026-09-19T23:51:16.242Z
updated_at: 2026-09-20T00:50:58.006Z
---

Game.run serializes all players through one promise chain. Admission can await a provider check and game operations await database work. An in-memory reproduction showed an unrelated action blocked behind a delayed availability check.

Acceptance criteria:

- Move slow provider/database work out of the global critical section or introduce per-match serialization with narrowly scoped matchmaking coordination.
- Revalidate admission and match state after asynchronous work; preserve one active seat per session, deadlines and identity secrecy.
- Bound pending work and avoid timer/heartbeat backlogs.
- Test one delayed or failed dependency while unrelated games continue sending messages, submitting verdicts and processing heartbeats.
