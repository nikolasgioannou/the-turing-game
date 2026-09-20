---
id: '034725'
title: Show overload states and stagger connection retries
status: done
priority: high
labels:
  - ux
created_at: 2026-09-19T23:51:16.304Z
updated_at: 2026-09-20T05:33:00.565Z
---

The client treats WebSocket admission failures as generic connection loss and retries using deterministic delays up to ten seconds. A surge can synchronize retries and leaves users unable to distinguish capacity limits from network failures.

Acceptance criteria:

- Expose retryable server-capacity and connection-limit status through a browser-readable admission response.
- Show a clear waiting/retry state without implying an existing match will be restored when none exists.
- Add randomized exponential backoff and honor server retry guidance where available.
- Keep explicit retry accessible without allowing rapid retry loops.
- Test many reconnecting clients, offline recovery, admission rejection and successful recovery.

Implementation/review outcome:

Session admission now returns browser-readable 429 responses with Retry-After guidance for connection limits. Client retries use jittered exponential backoff, a bounded handshake, an accessible retry action with cooldown, and copy that distinguishes lobby reconnects from restoring an existing room. Admission counts live sockets rather than asynchronously registered peers. Browser check verified temporary rejection, disabled manual retry during the advertised wait, recovery and an actual server disconnect without falsely promising a match. No game or model call was created.
