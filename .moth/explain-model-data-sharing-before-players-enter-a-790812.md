---
id: '790812'
title: Explain model data sharing before players enter a game
status: done
priority: high
labels:
  - privacy
created_at: 2026-09-19T23:51:16.319Z
updated_at: 2026-09-20T05:33:00.402Z
---

The app sends names, messages, unsent human drafts and device/time hints to the model through OpenRouter. The README describes this, but the player UI does not provide an explanation.

Acceptance criteria:

- Add a concise onboarding/rules explanation and an accessible privacy information link without adding composer helper clutter.
- Explain draft observation, names, device/time context and the role of OpenRouter and the model provider.
- Distinguish application retention from provider handling; verify provider statements rather than promising that data is never retained.
- Tell users not to enter sensitive personal information.
- Review notices across public games, invitations and repeat play.

Implementation/review outcome:

Added a concise role-selection disclosure plus expandable information in role selection, name entry and the lobby. It explains messages/names, unsent human drafts and device/time hints sent through OpenRouter to Anthropic, warns against sensitive information and links provider privacy policies. App retention is described separately without claiming provider zero retention or no training. Existing participants can reopen lobby information; invited guests see it at name entry. No composer helper text was added. Provider policy reviewed at https://openrouter.ai/privacy/; desktop/mobile review checks pass.
