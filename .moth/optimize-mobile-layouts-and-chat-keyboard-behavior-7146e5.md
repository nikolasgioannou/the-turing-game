---
id: '7146e5'
title: Optimize mobile layouts and chat keyboard behavior
status: backlog
priority: high
labels:
  - mobile
  - ux
created_at: 2026-09-14T19:10:08.935Z
updated_at: 2026-09-14T19:10:08.935Z
---

Review and improve every screen on mobile, with particular attention to composing messages while the software keyboard is open in both judge and player views.

Acceptance criteria:

- Verify lobby, dialogs, name entry, chat, guessing and results on small screens, including iOS Safari and Android Chrome.
- Keep the composer and Send button reachable above the keyboard without clipping, horizontal overflow or unintended page scrolling.
- Preserve input focus and drafts through incoming messages and phase changes. When sending is blocked, keep the field editable and block only Send and Enter submission.
- Handle keyboard opening/closing, changing viewport height, rotation and safe-area insets. Preserve sensible transcript scroll position and access to recent messages.
- Verify touch targets, readable text and modal scrolling, and record device/browser coverage and any remaining limitations. Desktop behavior must remain usable.
