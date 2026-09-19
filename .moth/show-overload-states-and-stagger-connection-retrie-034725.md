---
id: '034725'
title: Show overload states and stagger connection retries
status: backlog
priority: high
labels:
  - ux
created_at: 2026-09-19T23:51:16.304Z
updated_at: 2026-09-19T23:51:16.304Z
---

The client treats WebSocket admission failures as generic connection loss and retries using deterministic delays up to ten seconds. A surge can synchronize retries and leaves users unable to distinguish capacity limits from network failures.

Acceptance criteria:

- Expose retryable server-capacity and connection-limit status through a browser-readable admission response.
- Show a clear waiting/retry state without implying an existing match will be restored when none exists.
- Add randomized exponential backoff and honor server retry guidance where available.
- Keep explicit retry accessible without allowing rapid retry loops.
- Test many reconnecting clients, offline recovery, admission rejection and successful recovery.
