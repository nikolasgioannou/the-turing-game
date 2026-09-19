---
id: '56254c'
title: Add continuous repository checks and dependency security alerts
status: backlog
priority: high
labels:
  - maintenance
created_at: 2026-09-19T23:51:16.413Z
updated_at: 2026-09-19T23:51:16.413Z
---

Only the manually dispatched deployment workflow runs formatting, types, tests and build checks. GitHub reports Dependabot alerts disabled and main has no protection/rulesets.

Acceptance criteria:

- Add checks on pull requests and pushes using pinned actions and the existing Bun lockfile/version.
- Enable dependency vulnerability alerts and review dependency-update automation.
- Keep untrusted pull-request execution free of production secrets and deployment permissions.
- Consider blocking force-pushes and branch deletion while preserving the owners’ authorized direct-push workflow; do not require pull requests by default.
- Document how contributors run the same checks locally.
