---
id: 'b89168'
title: Broadcast lobby updates only when relevant state changes
status: done
priority: high
labels:
  - performance
created_at: 2026-09-19T23:51:16.257Z
updated_at: 2026-09-20T05:33:00.525Z
---

Game.persist calls lobby() after each chat/context update, and tick broadcasts lobby data every second to all peers. This amplifies traffic and serialization work as visitors and matches increase.

Acceptance criteria:

- Separate per-match updates from global score/availability updates and per-peer queue updates.
- Publish changed data to affected clients; ensure new connections receive a complete initial snapshot.
- Coalesce repeated updates and define slow-client/backpressure handling.
- Measure outgoing event counts with many idle visitors and simultaneous chats.
- Test score updates, queue transitions and availability recovery without relying on chat-triggered global broadcasts.

Implementation/review outcome:

Lobby snapshots are compared per peer before publishing. Coalesced score reads remain outside serialization; room messages continue only to participants. New peers receive an initial snapshot, while score/availability/capacity and each peer’s queue changes publish only when their data changes. Socket backpressure is bounded to 256 KiB and slow sockets close for normal reconnect recovery. A controlled test with 100 idle visitors and 20 unchanged ticks emitted zero repeat lobby events. Existing queue/score/availability tests pass. This measures event suppression, not sustained production throughput.
