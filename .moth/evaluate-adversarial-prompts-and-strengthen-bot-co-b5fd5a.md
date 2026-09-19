---
id: 'b5fd5a'
title: Evaluate adversarial prompts and strengthen bot content boundaries
status: backlog
priority: high
labels:
  - safety
created_at: 2026-09-19T23:51:16.352Z
updated_at: 2026-09-19T23:51:16.352Z
---

The bot prompt encourages decisive opinions and fictional personal details; response filters primarily address style and AI tells. Public chat requires evaluation beyond response quality.

Acceptance criteria:

- Define acceptable game content and ensure character behavior does not override those boundaries.
- Build an adversarial evaluation set covering harassment, personal-data extraction, prompt injection and harmful requests.
- Check whether unsent draft or device context can be exposed in replies; prevent disclosure where it is not part of the intended game.
- Preserve conversational style while providing safe handling for out-of-bounds prompts.
- Record model/version, evaluation coverage and remaining limitations without committing private conversations or credentials.
