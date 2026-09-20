---
id: 'f821f8'
title: Verify redistribution rights and privacy of public assets and fixtures
status: backlog
priority: medium
labels:
  - privacy
created_at: 2026-09-19T23:51:16.459Z
updated_at: 2026-09-20T05:33:00.762Z
---

The repository includes music and conversation fixtures. The font includes its license, but music provenance and the suitability of published conversations need explicit review.

Acceptance criteria:

- Confirm permission to distribute public/music.mp3 and record appropriate attribution/provenance or replace it.
- Review committed sample scenarios and test fixtures for private conversations and identifying information.
- Use synthetic or explicitly approved examples; do not publish private source transcripts.
- Check relevant repository history if sensitive material is found, and agree on remediation without treating file deletion as history removal.
- Document asset-specific licensing separately from the project license where appropriate.

Implementation/review outcome:

Partial review recorded in docs/asset-review.md. The font has its OFL notice; shared project icons generate the social assets. No documented music redistribution permission was found. Samples and behavior fixtures were inspected, but seed-example provenance/consent cannot be established from generation code alone. No sensitive material requiring history rewriting was established. Owner confirmation of music rights and sample provenance remains necessary; no license was invented and no history rewritten.
