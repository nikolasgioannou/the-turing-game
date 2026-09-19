---
id: 'ff8e92'
title: Add game readiness checks and operational alerts
status: backlog
priority: high
labels:
  - operations
created_at: 2026-09-19T23:51:16.382Z
updated_at: 2026-09-19T23:51:16.382Z
---

/api/health returns success whenever the HTTP handler responds, even if the database or serialized game loop is unhealthy. Current health checks cannot establish that new matches are playable.

Acceptance criteria:

- Separate basic liveness from bounded readiness checks for critical dependencies and game-loop responsiveness.
- Track active games, worker memory, pending work, request latency, provider failures and interruption rates.
- Configure useful alert thresholds and document diagnosis/recovery steps.
- Keep checks inexpensive and avoid model calls or exposing secrets/player content in telemetry.
- Verify behavior during database outage, blocked game processing, provider errors and memory pressure.
