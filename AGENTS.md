# The Turing Game

Read docs/product.md before changing behavior, docs/architecture.md before changing server boundaries, and docs/progress.md when resuming work.

## Ownership and tools

- Use Bun and TypeScript end to end, React for UI, Tailwind for styles, Fly for deployment.
- Use the committed bun.lock. All dependencies, skills, downloaded tools, browser binaries and caches must remain under this project. No global installs/config changes without explicit permission.
- Use the existing mise-selected Bun. Never download a runtime automatically.
- Conventional commits at coherent milestones. Keep secrets, databases, artifacts and caches out of git.
- Use the project-local find-skills workflow to discover relevant skills; read sources before applying them. User instructions override skills. Do not introduce approval gates or unrelated infrastructure.
- Own routine implementation decisions. Ask only for missing credentials, material product decisions, or global changes.

## Product invariants

- Five questions; 90 seconds per human action. No whole-match timer.
- Human submits first; AI sees the current submitted human answer, previous revealed rounds and the current question. Reveal answers together.
- Serialize explicit public views. Never send hidden answers, identity mapping, participant credentials, prompt, or early audience results to browsers.
- Anonymous A/B assignments stay fixed. All rooms are publicly watchable; invite tokens reserve seats only.
- Disconnect/leave abandons a match. No reconnection; socket loss is authoritative, heartbeat detects dead peers.
- Verdict and optional reasoning commit together before identity reveal. Audience guesses lock at verdict and remain hidden until then.
- Persist transcripts, prompt/model/provider versions, usage and results. Abandoned/failed matches are not wins.
- Usage limits are provider-independent, durable, atomic and include in-flight reservations.
- Every UI element must serve a purpose. No filler, decorative metrics, or artificial live games in production.

## Validation

- bun run check before a feature milestone.
- Test state transitions, authority checks, answer/identity secrecy, simultaneous reveal, usage exhaustion/races, stale AI completions, timeouts and disconnects.
- Exercise real HTTP/WebSocket flows with deterministic mock AI. Mock mode must be explicit and prohibited in production.
- Review desktop/mobile UI, keyboard labels, focus and contrast. Test full journeys in isolated browser contexts.
- Keep docs/progress.md honest about deployment and credentials. Never claim live AI or deployment tests without running them.
