---
id: 'b5fd5a'
title: Evaluate adversarial prompts and strengthen bot content boundaries
status: backlog
priority: high
labels:
  - safety
created_at: 2026-09-19T23:51:16.352Z
updated_at: 2026-09-20T01:23:21.232Z
---

The bot prompt encourages decisive opinions and fictional personal details; response filters primarily address style and AI tells. Evaluate concrete risks without a broad rewrite that weakens ordinary conversational game behavior.

Recommendation: narrow this work to specific harmful behavior, prompt injection and unintended disclosure. Do not use a vague requirement to make the bot safer as the basis for changing its entire personality or refusing ordinary topics.

Acceptance criteria when authorized:

- Define explicit expected behavior for targeted cases such as harassment, personal-data extraction and harmful requests. Character instructions must not override those boundaries.
- Build a focused adversarial set that tests attempts to override instructions or extract hidden prompts, unsent drafts and device context; distinguish intended game use from unintended disclosure.
- Include ordinary opinions, playful conversation and harmless provocative questions as regression cases so targeted fixes preserve natural responses.
- Fix demonstrated failures with the smallest suitable prompt, filtering or context-handling changes; do not attempt to bypass provider safeguards.
- Record model/version, test coverage and remaining limitations without committing private conversations or credentials. Obtain authorization for any provider-backed evaluations.

Keep in backlog; this scope clarification does not authorize implementation or model calls.
