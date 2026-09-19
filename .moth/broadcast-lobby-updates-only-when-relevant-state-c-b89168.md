---
id: 'b89168'
title: Broadcast lobby updates only when relevant state changes
status: backlog
priority: high
labels:
  - performance
created_at: 2026-09-19T23:51:16.257Z
updated_at: 2026-09-19T23:51:16.257Z
---

Game.persist calls lobby() after each chat/context update, and tick broadcasts lobby data every second to all peers. This amplifies traffic and serialization work as visitors and matches increase.

Acceptance criteria:

- Separate per-match updates from global score/availability updates and per-peer queue updates.
- Publish changed data to affected clients; ensure new connections receive a complete initial snapshot.
- Coalesce repeated updates and define slow-client/backpressure handling.
- Measure outgoing event counts with many idle visitors and simultaneous chats.
- Test score updates, queue transitions and availability recovery without relying on chat-triggered global broadcasts.
