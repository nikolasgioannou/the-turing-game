---
id: '4c14c7'
title: Recover cleanly when saving a verdict fails
status: done
priority: urgent
labels:
  - bug
created_at: 2026-09-19T23:51:16.273Z
updated_at: 2026-09-20T00:45:28.598Z
---

Game.finish marks a match complete before persist saves its outcome. If the write rejects, no result is broadcast, and another verdict is rejected because the match is already complete. Reproduced with a failing Store.saveOutcome: complete server state, zero room result events, retry rejected.

Acceptance criteria:

- Make completion and outcome persistence recoverable with an explicit state transition and idempotent retry behavior.
- Ensure both participants receive a coherent result or actionable interruption state after database failures.
- Preserve the judge’s choice and reasoning and prevent duplicate score increments.
- Test rejected writes, delayed writes, retry success, disconnect during completion and permanent database failure.
