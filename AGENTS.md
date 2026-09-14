# The Turing Game

Read docs/product.md before changing behavior, docs/architecture.md before changing server
boundaries, and docs/progress.md when resuming work.

## Ownership and tools

This repository is the canonical implementation. Describe bot behavior directly as part of this
project in documentation, comments and metadata.

- Use Bun/TypeScript for the app, React/Tailwind for UI, Fly for deployment. The bot runs Python
  conversation logic in a standard-library worker; OpenRouter handles inference.
- Use the committed bun.lock. All dependencies, skills, downloaded tools, browser binaries and
  caches must remain under this project. No global installs/config changes without explicit
  permission.
- Use the existing mise-selected Bun. Never download a runtime automatically.
- Automatically create conventional commits at completed milestones. Run bun run format before
  committing; keep source, config and docs readable with consistent indentation and blank lines
  between logical sections, hooks, functions and control-flow blocks. Prettier alone does not insert
  these blank lines; use the project format command. Keep secrets, databases, artifacts and caches
  out of git.
- Use the project-local find-skills workflow to discover relevant skills; read sources before
  applying them. User instructions override skills. Do not introduce approval gates or unrelated
  infrastructure.
- Own routine implementation decisions. Ask only for missing credentials, material product
  decisions, or global changes.

## Styling

- Tailwind v4 is configured through the Vite plugin and src/client/styles.css. Keep theme tokens
  there; do not add a v3 Tailwind config or a second stylesheet of overrides.
- Use static Tailwind utility classes for component layout and responsive states. Extract repeated
  markup into React components; keep shared controls and arcade effects in the components layer.
  Reserve @apply for reusable component styles.
- Update the original style rule rather than appending an override. Remove obsolete selectors with
  their components. Use bun run format to sort Tailwind classes automatically.
- Check lobby, dialogs, chat, verdict and replay on desktop and mobile at styling milestones. Only
  chat history scrolls during an active match.

## Product invariants

- Follow the bot opening: hold the human until AI reveal, or allow its early attack from drafts /
  silence. The first AI reply starts 90-second group chat. Preserve the original message order and
  all brain mechanics. Cancel late AI replies at chat closure.
- Serialize explicit public views. Never send hidden answers, identity mapping, participant
  credentials, prompt, or early audience results to browsers.
- Anonymous A/B assignments stay fixed. All rooms are publicly watchable; invite tokens reserve
  seats only.
- Explicit leave abandons a match. Socket loss does not: sessions reclaim their seats on
  reconnect/refresh while deadlines continue. Heartbeat only detects dead transports.
- The judge selects the AI: a correct guess means human wins; otherwise AI wins.
- Verdict and optional reasoning commit together before identity reveal. Audience guesses lock at
  verdict and remain hidden until then.
- Persist transcripts, prompt/model/provider versions, usage and results. Abandoned/failed matches
  are not wins.
- Usage limits are provider-independent, durable, atomic and include in-flight reservations.
- Every UI element must serve a purpose. No filler, decorative metrics, or artificial live games in
  production.

## Validation

- Run full checks at feature milestones, not after every feedback message. Keep visual iteration
  fast; use focused checks for changed interactions.
- Test state transitions, authority checks, opening/identity secrecy, simultaneous opening reveal,
  chat deadline and pacing, usage exhaustion/races, stale AI completions, timeouts and disconnects.
- Exercise real HTTP/WebSocket flows using real OpenRouter for browser journeys. Unit tests may
  inject controlled completions to verify state transitions and failures; no application mock mode
  or canned-response provider.
- Review desktop/mobile UI, keyboard labels, focus and contrast. Test full journeys in isolated
  browser contexts.
- Keep docs/progress.md honest about deployment and credentials. Never claim live AI or deployment
  tests without running them.
