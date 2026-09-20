---
id: '5013a9'
title: Preserve active games during production deployments
status: backlog
priority: high
labels:
  - operations
created_at: 2026-09-20T00:26:56.228Z
updated_at: 2026-09-20T01:23:21.189Z
---

Production deploys replace the single Fly machine immediately. Rooms and bot workers live in process memory, so replacement interrupts active games.

Recommendation: defer multi-machine room ownership, migration and seamless handoff architecture. First evaluate the simplest practical drain-and-wait deployment flow that lets existing games finish before replacing the process. Brief waiting for new arrivals is acceptable to evaluate; uninterrupted service must not be claimed without verification.

Initial scope when authorized:

- Stop assigning new games while allowing opening replies, chat, timers, verdict submission, pending outcome saves and result delivery to finish.
- Define behavior for queued players, reserved invitations and rematches so draining cannot wait indefinitely.
- Determine where draining occurs relative to Fly replacement and shutdown deadlines; changing the deployment strategy alone does not preserve in-memory rooms.
- Bound drain time and document forced shutdown, failed deployment and rollback recovery. Existing missing-match recovery helps explain interruptions but does not preserve a lost game.

Acceptance for the initial approach:

- Verify a controlled drain during opening, chat and verdict, including outcome persistence, without duplicate model work or scores.
- New arrivals receive accurate waiting/retry behavior and do not enter a process about to shut down.
- Reconnecting players recover their owning game while its process is alive; document cases where recovery is impossible.
- Document operational steps, unavoidable interruptions, verified limitations and any cost implications.

Only revisit overlapping machines or room migration if usage and deployment needs justify the complexity. That later scope must define room ownership, reconnect routing, coordinated matchmaking/cap enforcement and duplicate-work prevention before implementation.

Keep in backlog. This ticket does not authorize implementation or additional infrastructure spending.
