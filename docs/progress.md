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
