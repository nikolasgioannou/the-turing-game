# Progress — 2026-09-13

## Implemented

- Agreed product specification and AGENTS.md captured; three project-local skills installed and committed.
- Bun/TypeScript server, React/Vite/Tailwind client, PostgreSQL adapter and local PGlite.
- Public role matchmaking, invite seats, publicly watchable matches.
- Five rounds, simultaneous answers, fixed hidden A/B identities, 90-second human-action deadlines.
- Spectator votes and judge verdict/reasoning, permanent replay links.
- Durable model/prompt metadata, request usage ledger, atomic reservations, UTC daily caps, provider circuit and operator resume command.
- Disconnect/timeout/late completion/restart handling; production rejects mock mode/missing secrets.
- Minimal responsive UI and Fly/Docker packaging with a deployment runbook.

## Validation

- 12 engine/PostgreSQL tests (62 assertions) passed.
- Five browser tests passed: three-party five-round match/replay, invitation/disconnect, mobile overflow, desktop render, cross-origin rejection.
- TypeScript and production Vite build passed. Screenshots inspected on desktop and mobile.
- Test browser download failed; tests use existing Google Chrome with isolated contexts. No global software installed.
- Real OpenRouter key was found in the owner-created .env and used without displaying it.
- Hermes 4 70B returned 404. Live /models confirmed Hermes 4 405B available.
- Three real Hermes 4 405B checks succeeded (340 input, 166 output tokens total): dinner question, ordinary profanity, and staying in character. This checks API functionality, not competitive human-likeness. Default changed to 405B; goal-only prompt retained.

## Deployment deliberately paused

Owner asked us to pause before needing Fly because they have additional deployment details to provide. No Fly app, database or paid resources created; nothing deployed. No fly/flyctl or Docker found on the checked PATH. Need owner’s deployment notes, Fly login, approved organization/name/region/MPG plan. Real network PostgreSQL and container verification remain part of that deployment step.

## Local preview

http://localhost:3000 serves the built app using explicit mock AI. bun run dev serves the development app at http://localhost:5173. Automated tests always use mock AI and isolated PostgreSQL state. Do not mistake local preview for a production URL.

## Next

1. Receive owner’s additional deployment requirements.
2. Verify Fly setup and create only approved resources.
3. Validate container and Fly config, attach MPG and secrets, deploy single app machine.
4. Verify live multiplayer flow and replay/usage persistence against real PostgreSQL.
5. Play-test and evaluate human-likeness before changing the agreed simple system prompt.

## Local play-test update: opponent answer context

Owner requested a rule change after seeing the AI's overly formal answers. The AI now receives the human's submitted answer to the current question in addition to revealed history. Judge/spectator pending-answer secrecy and simultaneous reveal are unchanged. Prompt `opponent-context-v2` adds tone/length guidance while asking for an independent response. Tests updated: 12 passed, 63 assertions; typecheck/build passed.

Three live checks with human-answer context succeeded, including the screenshot's age question. Responses were still relatively formal/verbose, so receiving context is verified but human-like style is not solved. Avoid claiming this alone makes the model convincing.

Wi-Fi server restarted on http://192.168.1.233:3001 with live AI and data/wifi PGlite storage. Start new matches to test v2. Fly remains deferred for local iteration.

## AI SDK DevTools integration

Installed project-local ai 7.0.99, @ai-sdk/openai-compatible 3.0.48 and @ai-sdk/devtools 1.0.19, plus Vercel's ai-sdk skill. Migrated raw fetch to generateText and local DevToolsTelemetry. Prompt/model behavior unchanged from opponent-context-v2. SDK retries disabled; budget/error/usage behavior covered by four new adapter tests. 16 tests/79 assertions, TypeScript and build passed. Three real model calls succeeded and appeared in DevTools; visually inspected input (including human answer), output, token usage and raw-payload controls. Checked trace file did not contain the configured API key.

Local .env has AI_DEVTOOLS=true. Viewer running at http://localhost:4983 (loopback only); Wi-Fi live server restarted at http://192.168.1.233:3001 with tracing. Traces remain in ignored .devtools/generations.json. No historical trace backfill. Fly remains paused.

## Independent answers and model comparison

Owner caught an information leak in a proposed example: responding to the human's hidden joke would reveal the AI. Prompt independent-style-v3 now explicitly prohibits reacting to pending answers; these are named privateStyleReference in the provider payload. Added independent examples, brevity guidance and continuity rules.

Ran 20 real OpenRouter calls (ten per model). Euryale 3.3 70B gave stronger short replies and passed the embedded-instruction and identity-continuity probes; Dolphin failed both. Euryale selected as configurable default in code, local env, example env and Fly config. One Euryale call took 28.3s; latency remains a play-test concern. Full results and repeat command in docs/ai-comparison.md. All calls traced in DevTools and charged to an isolated local test ledger. No downloads or global installs. Fly remains paused.

Validation after changes: 16 tests / 79 assertions, TypeScript and production build passed. Wi-Fi live server restarted at http://192.168.1.233:3001 with the new default and prompt; health endpoint returned ok. Existing DevTools viewer remains at http://localhost:4983.
