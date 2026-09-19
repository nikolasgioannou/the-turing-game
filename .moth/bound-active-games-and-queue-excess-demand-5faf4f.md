---
id: '5faf4f'
title: Bound active games and queue excess demand
status: backlog
priority: urgent
labels:
  - performance
created_at: 2026-09-19T23:51:16.195Z
updated_at: 2026-09-19T23:51:16.195Z
---

Each match spawns a separate Bun process (src/server/ai.ts). Production uses one shared CPU and 512 MB of memory; the 1,000-connection ceiling does not establish safe active-game capacity.

Acceptance criteria:

- Add a configurable maximum number of active games, enforced across public matching, invitations, friend rematches and simulator work.
- Keep excess demand in a bounded queue with clear waiting/cancel behavior and fair admission when capacity becomes free.
- Measure worker memory and latency before selecting limits or changing machine size; document the measured safe range.
- Preserve the single-authority architecture. Do not add machines without shared room ownership/routing.
- Test simultaneous admissions, cancellation, disconnects and slot release after every terminal state.
