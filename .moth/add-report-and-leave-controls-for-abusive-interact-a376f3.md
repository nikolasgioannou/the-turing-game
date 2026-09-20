---
id: 'a376f3'
title: Add report-and-leave controls for abusive interactions
status: backlog
priority: high
labels:
  - safety
created_at: 2026-09-19T23:51:16.335Z
updated_at: 2026-09-20T01:23:21.218Z
---

The app pairs strangers but has no report/block flow. Leaving alone does not flag abuse or prevent immediate pairing with the same person.

Recommendation: retain an easy, accessible exit for both roles. Do not ship a report button until there is a real destination and handling workflow for reports.

Prerequisites before implementing reporting:

- Decide where reports go, who receives/reviews them and what follow-up is possible. Do not imply reports are monitored without an assigned owner and working process.
- Define minimal collected data, retention and user disclosure. Do not silently start storing transcripts or drafts.
- Define any session-level policy to avoid immediate rematching and how malicious reports are handled.

Acceptance criteria once those decisions are made and implementation is authorized:

- Provide clear report-and-leave controls that actually deliver reports to the agreed destination, with accurate confirmation and failure behavior.
- Apply the agreed repeat-pairing policy without making normal leaving depend on successful reporting.
- Test leaving, report delivery/failure, malicious reports, repeat pairing and accessible mobile controls.

Keep in backlog. Reporting is deferred pending the destination, owner and workflow decisions; an easy exit remains useful independently.
