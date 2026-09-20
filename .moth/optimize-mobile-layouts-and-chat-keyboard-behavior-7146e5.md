---
id: '7146e5'
title: Optimize mobile layouts and chat keyboard behavior
status: done
priority: high
labels:
  - mobile
  - ux
created_at: 2026-09-14T19:10:08.935Z
updated_at: 2026-09-20T01:05:39.890Z
---

Review and improve every screen on mobile, with particular attention to composing messages while the software keyboard is open in both judge and player views.

Acceptance criteria:

- Verify lobby, dialogs, name entry, chat, guessing and results on small screens, including iOS Safari and Android Chrome.
- Keep the composer and Send button reachable above the keyboard without clipping, horizontal overflow or unintended page scrolling.
- Preserve input focus and drafts through incoming messages and phase changes. When sending is blocked, keep the field editable and block only Send and Enter submission.
- Handle keyboard opening/closing, changing viewport height, rotation and safe-area insets. Preserve sensible transcript scroll position and access to recent messages.
- Verify touch targets, readable text and modal scrolling, and record device/browser coverage and any remaining limitations. Desktop behavior must remain usable.

Implemented keyboard-aware viewport layout, stable composer focus/drafts, transcript resize following, scrollable verdict controls and larger touch targets. Verified all 50 review states in Chromium and WebKit with mobile emulation, plus narrow/landscape/desktop and keyboard height/offset cases. Local games verified real replies, reconnect, verdict and server-state-loss recovery. Physical iOS Safari and Android Chrome keyboards remain a manual validation limitation; the automated checks do not claim native-device coverage.
