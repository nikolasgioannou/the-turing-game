---
id: '5faf4f'
title: Bound active games and queue excess demand
status: backlog
priority: urgent
labels:
  - performance
created_at: 2026-09-19T23:51:16.195Z
updated_at: 2026-09-20T01:23:21.159Z
---

The configurable 20-game cap and public waiting queue are already implemented. Production now uses one shared CPU and 2 GB RAM. Do not reimplement the delivered admission controls.

Delivered:

- MAX_ACTIVE_GAMES defaults to 20 unfinished rooms across public games, invitations, friend rematches and simulator work.
- Public excess demand waits for capacity and admits compatible players when a slot is released, with cancellation/disconnect handling.
- Friend creation/rematches and simulator starts return a retry response when full; an existing invitation reserves its slot.
- Tests cover simultaneous admission and slot release. The controlled Fly test admitted 20 games and held the extra pair until capacity became free; see docs/progress.md and a5b7a7 for measurement limitations.

Recommended remaining scope:

- Review the original queue-bounding, waiting-policy and terminal-state coverage requirements against the current implementation. Identify concrete gaps before starting any further work.
- Decide whether friend retry behavior is sufficient; a unified friend waiting queue is not a requirement for the initial release.
- Narrow this ticket to verified gaps, or close it after confirming the delivered behavior meets the chosen policy. Do not treat broader load testing as a blocker for the existing 20-game configuration.
- Preserve the single-authority architecture; additional machines require coordinated room ownership and routing.

Keep in backlog pending an explicit request to review or implement the remaining scope.
