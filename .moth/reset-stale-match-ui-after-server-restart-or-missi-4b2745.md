---
id: '4b2745'
title: Reset stale match UI after server restart or missing-room reconnect
status: done
priority: high
labels:
  - bug
created_at: 2026-09-19T23:51:16.288Z
updated_at: 2026-09-20T00:46:56.307Z
---

The client retains its room when reconnecting. The server restores only active rooms that still exist; after a restart it sends lobby data without explicitly clearing the old room.

Acceptance criteria:

- Include authoritative match-restoration status in the reconnect handshake.
- When a prior match is gone, clear stale timers/composers and explain that the game ended without counting.
- Offer a clear route to play again or return to the lobby.
- Preserve an existing active seat on ordinary transient disconnects.
- Test server-state loss, normal reconnect, expired games and postgame friend-rematch recovery.
