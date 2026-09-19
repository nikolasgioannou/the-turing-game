---
id: 'dc0d88'
title: Limit automated game creation and concurrent model requests
status: backlog
priority: urgent
labels:
  - security
created_at: 2026-09-19T23:51:16.227Z
updated_at: 2026-09-19T23:51:16.227Z
---

Provider credit limits bound spending but do not prevent automated clients from consuming the allowance. Sessions are cheap to create and a client can control both seats. OpenRouter must remain the spending authority.

Acceptance criteria:

- Add lightweight game-start throttling and a bounded concurrent-model-request policy, including retries and hedged requests.
- Apply admission controls consistently to public games, invitations, rematches and operator simulation.
- Consider a challenge only for suspicious traffic; preserve reasonable shared-network and normal replay behavior.
- Verify the actual production OpenRouter key limit and reset configuration without recording credentials. Do not assume the development key settings apply.
- Do not reintroduce local token/dollar accounting or a spending ledger.
- Test abusive repeated starts, multiple sessions and legitimate users competing for capacity.
