---
id: '4d66f9'
title: Correct page metadata and add social preview assets
status: done
priority: medium
labels:
  - ux
created_at: 2026-09-19T23:51:16.443Z
updated_at: 2026-09-20T05:16:42.150Z
---

index.html still describes five questions and identifying the human, while the game uses a timed chat to find the bot. The favicon is empty and explicit social preview metadata is missing.

Acceptance criteria:

- Update the description to match the current rules.
- Add appropriate Open Graph and social-card title, description, canonical URL and preview image.
- Add a recognizable favicon consistent with the design system.
- Verify metadata and image URLs from the production page and preserve fast loading.
- Keep the preview readable at common cropped and small display sizes.

Implementation update:

- Added current find-the-bot description, canonical URL, Open Graph and large-image social-card metadata in the initial HTML. Corrected the stale README introduction too.
- Added a 1200 × 630 pixel-art PNG using the shared human/robot components, plus SVG/32px favicon and 180px Apple touch icon. The card is approximately 251 KiB and is not loaded by the app page itself.
- Added bun run social:assets and docs/social-preview.md for repeatable exports and post-deployment checks.
- Reviewed the rendered card; typecheck, production build, raw built HTML and image HTTP responses/dimensions passed locally. No model calls or game servers were used.
- The live homepage still serves the old metadata. Keep this ticket in progress until deployment and verification of the public metadata/image URLs. GitHub repository social-preview upload is a separate manual setting; it has not been changed.

Production verification:

- Deployed caa891f through successful workflow 35491162003. Raw public HTML contains the updated metadata; all four image assets return HTTP 200 with bytes matching the committed files. Fly health and an authenticated lobby WebSocket check passed.
- The first deployment exposed a pooler rejection of the statement_timeout startup parameter. Fixed by applying SET LOCAL inside each transaction, preserving the four-second statement limit. All 248 tests, typecheck and build passed before the successful redeployment.
- No production games or model completions were created by verification. Platform-specific card caching/cropping and the optional GitHub repository image upload remain outside the page metadata implementation.
