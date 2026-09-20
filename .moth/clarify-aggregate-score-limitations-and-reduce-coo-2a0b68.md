---
id: '2a0b68'
title: Clarify aggregate score limitations and reduce coordinated manipulation
status: done
priority: medium
labels:
  - integrity
created_at: 2026-09-19T23:51:16.367Z
updated_at: 2026-09-20T05:33:00.709Z
---

Two cooperating clients can control both roles and repeatedly submit chosen outcomes. The homepage aggregate represents completed games, not unique people or a controlled scientific measurement of model performance.

Recommendation: start with honest score wording. Defer sophisticated anti-cheating, identity verification and reputation systems until observed abuse justifies them.

Initial acceptance criteria when authorized:

- Explain the aggregate as a casual game statistic and avoid unsupported claims about human/model detection ability or unique participants.
- Keep the wording concise and understandable in the homepage score UI.
- Preserve exclusion of simulated, failed and abandoned games and idempotent outcome writes; normal friend rematches remain legitimate repeat play.

Deferred scope:

- If coordinated or automated manipulation becomes a real issue, define the desired counting policy and evaluate proportionate, low-friction protections without unnecessary user tracking.
- Test observed abuse patterns alongside normal friend rematches before adopting those protections.

Keep in backlog; this scope clarification does not authorize implementation.

Implementation/review outcome:

Changed the score label to Games the bot won, with explicit wording that completed rounds include repeat players and friend games. No unique-person or scientific evaluation claim is made. Preserved existing idempotent outcome writes and exclusion of simulated, failed and abandoned games. Desktop/mobile review and existing outcome tests pass. Sophisticated anti-cheating remains deferred until actual abuse warrants a counting-policy change.
