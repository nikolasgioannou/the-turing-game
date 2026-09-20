---
id: '5013a9'
title: Preserve active games during production deployments
status: backlog
priority: high
labels:
  - operations
created_at: 2026-09-20T00:26:56.228Z
updated_at: 2026-09-20T00:26:56.228Z
---

Production deploys currently replace the single Fly machine immediately. Active rooms and bot workers live in process memory, so replacing that process interrupts games. Investigate and implement a practical deployment flow that lets existing games finish while the next version becomes available.

Scope:

- Evaluate draining the existing process before replacement versus temporarily running old and new machines together. Document feasibility, Fly shutdown limits, additional running cost, and the simplest safe approach.
- Stop assigning new games to a draining process while preserving current chat, opening replies, timers, verdict submission and result delivery. Account for waiting invitations, queued players and rematches so draining cannot wait indefinitely.
- If machines overlap, define room ownership and reconnect routing, coordinate matchmaking and the active-game limit, and prevent duplicate bot workers or outcome writes. Changing the deployment strategy alone is insufficient for in-memory rooms.
- Bound drain time and handle forced shutdown, failed deployments and rollback with clear player recovery. Coordinate with ticket 4b2745 for stale-room recovery.

Acceptance criteria:

- A controlled deployment during opening, active chat and verdict allows existing games to finish without losing messages, duplicating model work or scoring twice.
- New arrivals receive an accurate waiting state or reach the new version without entering a process that is shutting down.
- Reconnection during deployment returns participants to their owning game when it still exists.
- Document any unavoidable interruption cases, operational steps, cost implications and verified limitations. If seamless continuation is not feasible within the chosen architecture, record the required changes and provide a safe drain-and-wait alternative.

This ticket does not authorize implementation or additional infrastructure spending.
