---
id: 'ff8e92'
title: Add bounded game readiness and deployment checks
status: done
priority: high
labels:
  - operations
created_at: 2026-09-19T23:51:16.382Z
updated_at: 2026-09-20T05:33:00.828Z
---

/api/health returns success whenever the HTTP handler responds, even if the database or serialized game loop is unhealthy. Current health checks cannot establish that new matches are playable.

Acceptance criteria:

- Separate basic liveness from bounded readiness checks for critical dependencies and game-loop responsiveness.
- Track active games, worker memory, pending work, request latency, provider failures and interruption rates.
- Configure useful alert thresholds and document diagnosis/recovery steps.
- Keep checks inexpensive and avoid model calls or exposing secrets/player content in telemetry.
- Verify behavior during database outage, blocked game processing, provider errors and memory pressure.

Implementation/review outcome:

Scope decision: external alerting is explicitly excluded by the owner. This milestone covers bounded infrastructure readiness and deployment failure detection; continuous resource/error telemetry and a monitoring dashboard are deferred.

Implemented /api/ready with coalesced database and serialized-game-loop probes, a two-second deadline/cache, generic errors and no model calls. Timed-out probes remain shared until settled so checks cannot pile up. Provider exhaustion or a full room cap pauses admission without failing infrastructure readiness. Deployment curl now has connection, request and total retry limits. Diagnosis/recovery and the retained liveness routing check are documented. Unit tests cover rejection, hung dependencies, concurrent callers and recovery; real HTTP checks verify readiness and provider-unavailable admission. No external monitor or destination was configured.
