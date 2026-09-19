---
id: '2a0b68'
title: Clarify aggregate score limitations and reduce coordinated manipulation
status: backlog
priority: medium
labels:
  - integrity
created_at: 2026-09-19T23:51:16.367Z
updated_at: 2026-09-19T23:51:16.367Z
---

Two cooperating clients can control both roles and repeatedly submit chosen outcomes. The homepage aggregate is therefore a game statistic, not a controlled measurement of model performance.

Acceptance criteria:

- Decide and document whether the aggregate represents casual play or a stronger evaluation claim.
- Use accurate UI wording and avoid unsupported claims about human/model detection ability.
- Evaluate low-friction duplicate/automated outcome abuse protections without introducing unnecessary user tracking.
- Keep simulated, failed and abandoned games excluded and preserve idempotent outcome writes.
- Test coordinated repeat play and normal friend rematches against the chosen policy.
