---
id: '790812'
title: Explain model data sharing before players enter a game
status: backlog
priority: high
labels:
  - privacy
created_at: 2026-09-19T23:51:16.319Z
updated_at: 2026-09-19T23:51:16.319Z
---

The app sends names, messages, unsent human drafts and device/time hints to the model through OpenRouter. The README describes this, but the player UI does not provide an explanation.

Acceptance criteria:

- Add a concise onboarding/rules explanation and an accessible privacy information link without adding composer helper clutter.
- Explain draft observation, names, device/time context and the role of OpenRouter and the model provider.
- Distinguish application retention from provider handling; verify provider statements rather than promising that data is never retained.
- Tell users not to enter sensitive personal information.
- Review notices across public games, invitations and repeat play.
