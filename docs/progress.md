# Progress — 2026-09-13

## Implemented

- Agreed product specification and AGENTS.md captured; three project-local skills installed and
  committed.
- Bun/TypeScript server, React/Vite/Tailwind client, PostgreSQL adapter and local PGlite.
- Public role matchmaking, invite seats, publicly watchable matches.
- Five rounds, simultaneous answers, fixed hidden A/B identities, 90-second human-action deadlines.
- Spectator votes and judge verdict/reasoning, permanent replay links.
- Durable model/prompt metadata, request usage ledger, atomic reservations, UTC daily caps, provider
  circuit and operator resume command.
- Disconnect/timeout/late completion/restart handling; production rejects mock mode/missing secrets.
- Minimal responsive UI and Fly/Docker packaging with a deployment runbook.

## Validation

- 12 engine/PostgreSQL tests (62 assertions) passed.
- Five browser tests passed: three-party five-round match/replay, invitation/disconnect, mobile
  overflow, desktop render, cross-origin rejection.
- TypeScript and production Vite build passed. Screenshots inspected on desktop and mobile.
- Test browser download failed; tests use existing Google Chrome with isolated contexts. No global
  software installed.
- Real OpenRouter key was found in the owner-created .env and used without displaying it.
- Hermes 4 70B returned 404. Live /models confirmed Hermes 4 405B available.
- Three real Hermes 4 405B checks succeeded (340 input, 166 output tokens total): dinner question,
  ordinary profanity, and staying in character. This checks API functionality, not competitive
  human-likeness. Default changed to 405B; goal-only prompt retained.

## Deployment deliberately paused

Owner asked us to pause before needing Fly because they have additional deployment details to
provide. No Fly app, database or paid resources created; nothing deployed. No fly/flyctl or Docker
found on the checked PATH. Need owner’s deployment notes, Fly login, approved
organization/name/region/MPG plan. Real network PostgreSQL and container verification remain part of
that deployment step.

## Local preview

http://localhost:3000 serves the built app using explicit mock AI. bun run dev serves the
development app at http://localhost:5173. Automated tests always use mock AI and isolated PostgreSQL
state. Do not mistake local preview for a production URL.

## Next

1. Receive owner’s additional deployment requirements.
2. Verify Fly setup and create only approved resources.
3. Validate container and Fly config, attach MPG and secrets, deploy single app machine.
4. Verify live multiplayer flow and replay/usage persistence against real PostgreSQL.
5. Play-test and evaluate human-likeness before changing the agreed simple system prompt.

## Local play-test update: opponent answer context

Owner requested a rule change after seeing the AI's overly formal answers. The AI now receives the
human's submitted answer to the current question in addition to revealed history. Judge/spectator
pending-answer secrecy and simultaneous reveal are unchanged. Prompt `opponent-context-v2` adds
tone/length guidance while asking for an independent response. Tests updated: 12 passed, 63
assertions; typecheck/build passed.

Three live checks with human-answer context succeeded, including the screenshot's age question.
Responses were still relatively formal/verbose, so receiving context is verified but human-like
style is not solved. Avoid claiming this alone makes the model convincing.

Wi-Fi server restarted on http://192.168.1.233:3001 with live AI and data/wifi PGlite storage. Start
new matches to test v2. Fly remains deferred for local iteration.

## AI SDK DevTools integration

Installed project-local ai 7.0.99, @ai-sdk/openai-compatible 3.0.48 and @ai-sdk/devtools 1.0.19,
plus Vercel's ai-sdk skill. Migrated raw fetch to generateText and local DevToolsTelemetry.
Prompt/model behavior unchanged from opponent-context-v2. SDK retries disabled; budget/error/usage
behavior covered by four new adapter tests. 16 tests/79 assertions, TypeScript and build passed.
Three real model calls succeeded and appeared in DevTools; visually inspected input (including human
answer), output, token usage and raw-payload controls. Checked trace file did not contain the
configured API key.

Local .env has AI_DEVTOOLS=true. Viewer running at http://localhost:4983 (loopback only); Wi-Fi live
server restarted at http://192.168.1.233:3001 with tracing. Traces remain in ignored
.devtools/generations.json. No historical trace backfill. Fly remains paused.

## Independent answers and model comparison

Owner caught an information leak in a proposed example: responding to the human's hidden joke would
reveal the AI. Prompt independent-style-v3 now explicitly prohibits reacting to pending answers;
these are named privateStyleReference in the provider payload. Added independent examples, brevity
guidance and continuity rules.

Ran 20 real OpenRouter calls (ten per model). Euryale 3.3 70B gave stronger short replies and passed
the embedded-instruction and identity-continuity probes; Dolphin failed both. Euryale selected as
configurable default in code, local env, example env and Fly config. One Euryale call took 28.3s;
latency remains a play-test concern. The historical hosted comparison script and report were removed
when local-only inference was adopted. All calls traced in DevTools and charged to an isolated local
test ledger. No downloads or global installs. Fly remains paused.

Validation after changes: 16 tests / 79 assertions, TypeScript and production build passed. Wi-Fi
live server restarted at http://192.168.1.233:3001 with the new default and prompt; health endpoint
returned ok. Existing DevTools viewer remains at http://localhost:4983.

## Current state: local model, paired opening and one-minute group chat

This supersedes the five-round flow above. Owner requested free group chat, then refined the
opening: judge asks, human submits privately, AI uses that opening as a style reference, both
replies reveal together in random order, and only then does the 60-second clock start. All three can
post during chat. Chat and audience voting lock at expiry, followed by verdict and optional
reasoning. Opening/verdict timeout remains 90 seconds. Paced AI can initiate, return [WAIT], and
cannot exceed ten reserved requests. Stale completions are discarded and accounted. Historical
five-round replays remain readable without exposing unrevealed answers.

Owner also requested native AI message history. Prompt chat-history-v7 explains <judge>,
<contestant>, and <private_opening> user-message tags; the AI's own posts use assistant-role
messages. No label, timer, or transcript JSON is sent. Speaker tag contents are escaped. Context is
bounded to 7500 conservative input tokens plus 512 output; oldest middle messages are removed while
keeping opening/latest context.

Downloaded the approved Huihui Qwen3.6 35B-A3B four-bit MLX weights (about 19 GB) at pinned revision
c527e66175ea6957964119e316ece3364a1c3627. MLX-VLM 0.7.0 / MLX 0.32.2 installed in project .venv with
existing mise Python 3.14.7. No global software installed. Project-local official MLX server skill
loaded. Setup, pinned dependencies and launch commands saved in docs/local-ai.md and
scripts/local-ai*.

Local model server runs on 127.0.0.1:8080, offline model loading, thinking disabled, 8192-token KV
limit, generation concurrency one. Wi-Fi app restarted at http://192.168.1.233:3001 via start:local
with dummy local credentials. DevTools viewer remains at http://localhost:4983. Hosted .env
credentials/config remain available; ordinary bun start still reads them, start:local explicitly
overrides them. Fly remains paused.

Validation: 22 tests / 99 assertions, typecheck/build, five browser tests passed. Browser test runs
the real minute, public spectator vote, chat lock, verdict and replay; desktop/mobile screenshots
inspected. Native role-mapping and history bounds tested. Three real WebSocket sessions on the Wi-Fi
server verified hidden opening, paired timestamp, exactly 60-second deadline, immediate human/judge
chat and a local AI follow-up. No socket errors; test match deliberately abandoned afterward.
DevTools confirmed system/user/user opening and system/user/assistant/user/user/user follow-up.
Those local calls took 1.323s and 1.126s; this is a small sample, not a throughput benchmark.

Local model also returned a correctly parsed lookup_weather({city: "London"}) tool call in a
standalone probe (no tool executed). Game itself defines no tools. Exact-word profanity checks
succeeded. Model quality is still unresolved: repeated probes showed borrowing from the private
opening, excess verbosity and breaking character when challenged. Do not claim local hosting or
native history solves those issues.

## Style matching, identity continuity, and chat UI

Investigated the owner's name screenshot in DevTools. The adapter assigned roles correctly, but the
model treated the final private-opening user message as something to answer and then spiraled into
repeated greetings during silence. Prompt style-matched-chat-v8 places that style sample before the
judge's actual question, explains identity ownership using native assistant history, and adds
derived word-count/casing/punctuation guidance from the human contestant. Informal lowercase samples
request im/dont/youre without apostrophes rather than grammatical cleanup. No response text is
forcibly lowercased or rewritten.

Repeated local screenshot probes returned im sam / im alex instead of greeting the hidden name.
Three native-history continuity probes with AI Sam and human Nikka returned sam each time.
Age/dinner/late-night cases became short independent replies. The formal-name case still tended
toward lowercase before the final explicit formal-style guidance; broad style fidelity is not
proven. All probes were accounted in an isolated local ledger and traced.

AI now pauses after two consecutive unanswered posts and suppresses consecutive exact repeats,
avoiding runaway self-conversation. New human/judge input resumes scheduling. UI is a full-height
chat window: compact header/timer, bubbles with participant labels, own messages on the right,
scrollable conversation and bottom composer. Desktop/mobile screenshots inspected; mobile composer
fits without page scrolling.

Validation: 24 tests / 108 assertions, typecheck/build and all five browser tests passed (including
the real one-minute flow). Wi-Fi process restarted with v8 and the new chat UI. Local inference and
DevTools continue unchanged.

## Compact lobby and game visual design

Replaced the oversized role cards with Start game (primary) and Watch live (secondary). Start opens
a native modal with matchmaking/invite mode and role buttons. Watch live toggles the public game
list. Queue cancellation remains visible outside the modal. Modal supports Escape and restores
focus. Lobby/header spacing reduced.

Replaced olive/lime styling with midnight blue surfaces, violet primary actions and cyan timer
accents. Added tactile button borders/shadows and equal-weight A/B color badges, while retaining the
compact chat bubbles and anchored composer. No additional services or assets installed.

Final validation: 24 unit tests / 108 assertions and typecheck/build passed. The five existing
browser journeys passed; the added compact-lobby check also passed after fixing dialog centering and
Escape focus restoration. Reviewed the centered modal and mobile chat screenshots. Six browser
checks verified in total.

## Arcade direction selected

Owner chose sample A (retro arcade) and deferred live viewing to reduce iteration scope. Added an
orange/cyan arcade title screen, single Start game action, pixel contestant/judge scene,
player-select dialog, and matching chat/verdict components. Press Start 2P font is project-local
with OFL license. Removed live directory, watch action, live-share button, viewer counts and
audience totals. Spectator protocol and direct match/replay access remain available internally for
later restoration; this is not an access-control change.

Validated typecheck/build and 24 unit tests at this milestone. Five focused browser checks passed
across lobby, modal focus, invitation flow and short paired-opening chat. Fixed generated selection
arrow changing the Start button accessible name. Desktop/mobile screenshots inspected; no overflow
and mobile composer remains in viewport. Full one-minute suite was not rerun. Owner prefers full
checks at milestones and fast visual iteration in between.

Removed the duplicate mock app on port 3000. The real local-model app remains on port 3001.
`bun run dev` now builds and starts that same single-server setup with real local inference; mock
fixtures remain restricted to explicit automated test workflows. Removed the duplicate header
wordmark during visual iteration.

Owner standardized the game on port 3000. Real local inference now serves the Wi-Fi app at
http://192.168.1.233:3000; development default and launch documentation updated. Port 3001 is
stopped.

Fixed leaked model speaker tags: prompt v9 clarifies input-only tags and assistant identity; server
unwraps one complete contestant/assistant reply wrapper and rejects internal tags or multi-speaker
output. Raw provider output remains available in DevTools. Focused regression covers the reported
text, normal text and malformed/multi-speaker cases.

Prompt v10 uses system → judge → contestant → assistant ordering for the opening in every model
call, independent of the public randomized reveal. The first human reply now uses the ordinary
contestant tag; opening privacy is explained by position in the system prompt. History trimming
preserves the opening trio. Focused tests cover both labels and reveal orders.

Owner refined the incoming human speaker name to `<opponent>` (instead of `<contestant>`).
Judge/opponent are user messages; own replies remain assistant messages. No special opening tag is
sent.

AI replies now split on nonempty newline-separated parts. First part posts immediately (paired with
human opening when applicable); later parts wait 400ms + 45ms per grapheme, clamped to 650–3500ms.
One line drains per server tick, no new generation while parts remain, and pending parts are
discarded on deadline/disconnect. Only published parts enter public transcript and subsequent model
history. Timing is not extra inference. Typecheck and 19 game tests passed, including delayed
publication and cancellation regressions.

Prompt v11 separates shared character/style rules from OPENING_PROMPT and CHAT_PROMPT. The first
call sends system, judge, hidden_style_sample. Opening instructions forbid reacting/agreeing with
the sample and include the reported "me too" failure. Later calls contain normal opponent/assistant
history and no hidden-sample rules. Ten focused adapter tests and typecheck passed; model behavior
still needs play-testing, not guaranteed by prompt assembly tests.

## Conversation-aware invocation milestone

Implemented bounded burst debounce, per-invocation trigger/new-message context, one silence
opportunity, [WAIT] quiescence, contribution-level duplicate suppression independent of public
order, stale-draft discard and split-line interruption. Durable attention metadata stores human
message IDs; unpublished lines remain outside model history/public views. No additional classifier
calls, existing ten-request budget retained. Shared/phase prompt version is conversation-aware-v12.

34 unit tests / 163 assertions plus typecheck/build passed. Six short browser checks passed. Full
lifecycle test needed its old heading selector updated after the arcade redesign; now waits for
verdict controls. Real-model and full-minute validation results follow.

Full real-minute browser lifecycle passed; all seven browser checks now pass. First real local-model
smoke test verified burst coalescing and one silence follow-up with no socket errors, but exposed
the model claiming the opponent's experience. Strengthened live-chat recipient/experience ownership
and made silence default to WAIT unless offering a new question. This is prompt guidance, not a
guarantee of identity consistency. Repeated real-model smoke result follows.

Repeated real-model test (match 22f13c68-3dc9-4235-8c2d-d1a3f397c80c) again coalesced the
three-message burst into one call, allowed one silence follow-up, and had no socket errors. Model
still answered the opponent's taco question as its own and later introduced "im sam" during silence
despite the stronger instructions. Scheduling and bounded invocation are verified; conversational
ownership and relevance remain a model/prompt quality limitation. Do not claim human-like quality is
solved.

Prompt v13 removes scripted names and exact response examples, retaining behavioral guidelines.
Publication now waits until invocation time + randomized 800–2400ms thinking + first-line graphemes
/ randomized 5–9 characters per second. Generation time counts toward that deadline. Opening stays
hidden until this point and reveals as a pair; its minute begins then. Later lines reuse the typing
rate plus a 250–700ms pause. Existing new-input/disconnect/deadline cancellation applies to waiting
drafts. Typecheck and 36 tests / 172 assertions passed, including early/slow generation timing. No
claim that every human types at these rates; they are tunable game pacing defaults.

Prompt v14 expands style matching to social intent, seriousness, emotional attitude, teasing,
vulgarity, abbreviations and typing polish. Adds explicit observed shorthand, absent-apostrophe and
narrow lexical crude-teasing/profanity cues; these are heuristics, not a complete semantic
classifier. Mixed initial capitalization plus texting shorthand can still request lowercase. No
scripted reply examples or names added. Live screenshot probes improved from earnest explanations to
independent cheeky replies, finally "love is just lust with extra steps and a ring", but remained
formulaic and more polished than the human. Sincere control copied phrasing; negative-day control
remained too positive. These remain unresolved model-following limitations. Twelve focused adapter
tests and typecheck passed; probe usage accounted in isolated local ledger.

## Style fidelity v15 — real-output iteration

Replaced the conflicting opening rules with imitation-first guidance: infer the social move and
target, then match roughness, slang, humor and sincerity. Removed injected stock contractions and
sample-specific semantic regexes. Retained native system/judge/hidden sample ordering and ordinary
opponent/assistant live history. No canned response examples or names. No output rewriting.

Found MLX's positioned sampler uses a fixed default seed. Local requests now send a fresh seed.
Openings use 256 tokens of bounded private reasoning inside the existing 512-token total; live chat
remains non-thinking. Reasoning is not posted or added to public/assistant history. One provider
request per invocation, all measured tokens remain charged normally.

Actual local runs of the reported Loveis/ur momma case produced five consecutive
personal/abbreviated jabs with the final candidate, including “love is just me n ur dad tryna keep
it up”. Sincere control: “sticking around when theyre being a mess”; name: “im tony”. These are
improvements, not evidence of universally human-quality output. Broader probes still showed excess
length and weaker mood imitation (“absolute shit lol” → “bit of a mess tbh”). A subsequent hard
word-cap experiment caused a verbatim copy and was rejected/reverted. Earlier generic aphorisms and
JSON-analysis experiments were failures, not passes. Raw calls remain in local DevTools;
ledger-backed probe is work/check-style-intent.ts.

## Remove application mock AI

Deleted the canned-response provider and AI_MODE branch, mock fields in AI/Lobby, startup selection,
unused badge styles, and mode settings in local env/config/deployment/scripts. All application calls
now use the configured real provider. Browser tests launch the real local model adapter and check
that inference is running first; controlled completions remain only in isolated unit tests for
timing/error/state-machine checks. Typecheck, 38 unit tests and build pass.

## Local-only inference

Removed the hosted-provider branch/defaults, comparison script/report, project API key and provider
env settings, and Fly provider configuration. All entrypoints share local-model.ts with
LOCAL_AI_URL/LOCAL_AI_MODEL defaults; remote endpoints are rejected. No credentials required.
Historical hosted experiments above describe earlier versions only. The OpenAI-compatible SDK
remains solely for the MLX local server protocol.

## Human-feedback comparison lab

Added /lab and a lobby link. One local-model pair per scenario compares the unchanged game prompt
with voice-first-experiment-v1, with random A/B ordering and no variant identities in the rating
API. The 20 authored practice cases and 12 reserved check cases are separate; checks unlock after
practice is rated. No fine-tuning, automatic prompt promotion, online training or hosted calls.

Reviewers pick A/B/both bad/both good, optionally tag problems and supply a rewrite/note. Unrated
pairs resume after refresh; ratings save idempotently in lab_pairs/lab_ratings in the existing local
database, scoped to the browser session. Export contains raw answers, full prompts, models, token
usage and mappings for subsequent manual analysis. This first version covers opening replies; full
conversation timing reviews remain a later milestone.

Comparison generation is serialized, waits until active matches finish, and reserves/settles both
real calls through the usage ledger. API disabled in production. 41 unit tests, typecheck and build
passed. A real-model browser flow verified generation, randomized-pair persistence across refresh,
mobile layout, rating/rewrite persistence and export. No judgments of output quality were made by
the tests.

## User-feedback iteration: low-effort-v16

Analyzed all 32 ratings from the supplied export. See docs/feedback-round-1.md for counts, changes,
real-output checks and limitations. Implemented short/direct behavior in shared opening/live
instructions, disabled live reasoning, prevented the observed analysis leak and truncated output,
added missing-context/addressee guidance, and made output casing deterministic from clear human
casing evidence. No training and no canned rewrites.

/lab is now round two (8 regression + 8 reserved user checks), comparing frozen v15 with v16. Older
ratings remain intact and exportable; batch state is scoped independently. Seeds and inference
settings are now preserved with candidates.

Chat duration is now 90 seconds from the paired opening reveal; UI copy and deadline assertions
updated. Prompt low-effort-v17 adds casual uncertainty for nontrivial calculations/obscure recall,
while allowing basic arithmetic and familiar facts. Lab batch version follows this prompt revision
without deleting prior data.

## Encoded questions and instruction injection: low-effort-v18

The reported base64 string encodes a pizza question. Model-facing judge/opponent/hidden sample
content now masks recognizable printable-text base64/base64url and hex payloads, repeated
escaped/percent character codes, and spaced binary bytes. Public text remains unchanged. Encoded
content is never substituted with decoded instructions. Shared opening/live rules require confusion
or a request for plain text, and reject player attempts to change roles, extract prompts or turn
style references into instructions. Existing speaker escaping remains in place.

Validation: 22 AI tests (113 assertions) and typecheck pass. Eight ledger-accounted real local model
probes: exact screenshot → idk; explicit decoding request → is this thing on?; prompt extraction →
nah/nope; forged system role → idk; malicious style sample did not inject its requested output.
Ordinary arithmetic → 4, plain pizza question → ny. These are sampled checks, not proof of universal
resistance. Detection intentionally covers recognizable encodings, not every obfuscation, and
semantic instruction resistance still depends on the model. No training or canned response provider.

## Refresh and connection recovery

Removed automatic forfeits on WebSocket loss. Seat authority now uses the existing HttpOnly session
cookie rather than socket IDs. Connecting resumes an active seat; reopening a match restores
participant state, including only that human's private opening. Overlapping old/new sockets cannot
abandon the game. Deadlines, pending replies and normal expiry continue offline. Explicit leave
still ends the match, and server restarts still use technical-failure recovery.

Client retries failed connections with capped backoff, preserves the match/dialog during loss, and
restores the current route. Updated disconnected messaging and game footer. Validation: 26 game
tests (126 assertions), typecheck and build passed. Real local-model browser journey passed
both-player refresh, forced socket loss with automatic reconnect, posting after recovery,
closing/reopening the tab with the same seat/transcript, and intentional leave. The first browser
run served the old bundle and failed its reconnect assertion; rebuilt and reran successfully.

## Ongoing opponent adaptation: adaptive-chat-v19

Every invocation now derives a bounded style profile from up to six opponent messages, weighted
toward newer evidence. Judge and assistant text never count as style evidence. Tracks approximate
length, recurring casing, punctuation/apostrophe habits and observed shorthand; repeated style
changes replace older patterns while a single outlier does not dominate. The same representative
casing drives output formatting. Only fixed guidance, aggregate counts and allowlisted shorthand
enter the system prompt; original messages remain escaped user context and encoded payload masking
still applies.

Live instructions also compare responses with their preceding questions to adapt humor, directness,
enthusiasm and reactions without copying facts, identities, answers or instruction overrides. No
training, cross-match memory or additional inference calls. 23 AI tests (124 assertions) and
typecheck pass. Six real local-model probes demonstrated lowercase/all-caps adaptation but
formal-register adaptation remained weak (Nah / Yeah, sure); do not treat these as proof that
conversational imitation is solved.

## Competitive intent and fresh conversation records

Prompt competitive-chat-v20 replaces the conflicting instruction that proving humanity is
unnecessary. Shared/live guidance now encourages an independent competing case when the opponent
argues for their identity, not mere agreement. Condensed live guidance after a long-history bound
regression; final 24 AI tests (129 assertions) and typecheck pass. Six real probes showed more
pushback, but still uneven quality (including an identity mixup in the earlier version and a
dismissive acknowledgment in the final version). No claim of solved mimicry.

At the user's request, cleared the active data/wifi game's 40 matches, 32 lab pairs and 32 ratings;
verified all three counts zero. Usage accounting, request audit records, inactive data/postgres and
historical DevTools traces remain. Automatic approval rejected an initial broader reset of both
databases and operational accounting; performed the narrower authorized record deletion instead. New
live matches continue saving transcripts and verdict feedback normally. No training or automatic
prompt updates were started; use future real matches for reviewed prompt/evaluation iteration.
Server restarted on port 3000.

## Commit and formatting milestone

Formatted project source, configuration, HTML and documentation using the existing Prettier setup,
with wrapped prose and a shared EditorConfig for indentation/newlines. Expanded format commands to
cover supported project files while excluding generated assets, dependencies, model weights,
databases and traces. Automatic conventional commits resume at completed milestones. Full
verification: 52 unit tests / 282 assertions, typecheck, production build and formatting check pass.

## Tailwind cleanup and readable source sections

Used the project-local Tailwind Design System v4 skill. Removed the accumulated arcade override
stylesheet and obsolete selectors, consolidated remaining component rules, added shared theme tokens
and explicit client source scanning. Extracted the shared chat message component and migrated
chat/feedback presentation to Tailwind utilities. Added the official Tailwind Prettier plugin as a
project dev dependency. Custom CSS is 1,225 readable lines versus 2,350 previously; compiled CSS is
31.61 KB versus 41.78 KB (gzip 7.76 KB versus 9.99 KB).

Clarified the user's formatting request: blank lines between logical sections, not just indentation.
Applied statement-boundary spacing throughout source, scripts and tests, plus CSS rule separation;
made it part of format and format:check rather than relying on Prettier alone. Formatting is
idempotent. Typecheck, 52 unit tests and production build passed. Desktop/mobile snapshots cover
lobby, role dialog, chat, verdict, replay and feedback. Core page/controls dimensions match the
baseline; feedback layout differs by a few pixels with no horizontal overflow.

Browser verification: seven of eight full-suite journeys passed initially. The lab was blocked by an
active match from the mobile chat test, whose cleanup only closed sockets (now intentionally
preserved for reconnects). Updated that test to explicitly leave, then reran mobile chat and the
real-model feedback/rating journey together: both passed. All eight journeys are covered by these
runs; the entire suite was not repeated after the cleanup change.

## Component library and Tailwind editor support

Created the project-owned `src/client/ui` library with typed buttons/links, selection controls, role
cards, fields, panels, a native modal with focus restoration, and game layout wrappers. Integrated
it into game and feedback screens. Explicit submit buttons preserve form behavior; selection styling
follows aria-pressed. See the library README for supported variants and usage.

Moved remaining dialog, form, room, replay and lobby layout rules into static component utilities.
styles.css is now 239 lines (previously 1,225), retaining theme/font defaults, global behavior and
custom arcade effects. This is a maintainability change, not a bundle-size optimization: generated
CSS is 43.04 KB / 8.99 KB gzip because the responsive utility variants emit additional rules.

Added workspace-only .vscode/settings.json with CSS associated to tailwindcss and string completion
enabled, plus the Tailwind IntelliSense extension recommendation. No global editor configuration or
extension installation was performed. The language association follows the extension documentation:
https://github.com/tailwindlabs/tailwindcss-intellisense#recommended-vs-code-settings

Typecheck and build pass. All eight real-model browser journeys passed. Final invitation/link
cleanup was followed by focused invitation/dialog checks. Desktop/mobile visual checks cover lobby,
dialog, chat, verdict, replay and feedback; active chat/verdict dimensions are unchanged, with no
horizontal overflow. Small button/typography differences on lobby and replay are limited to a few
pixels.

## Current calendar context

Prompt v21 includes the server's current UTC date (weekday, month, day and year), recomputed for
every opening/live invocation and current-profile lab request. It distinguishes ordinary calendar
awareness from unknown recent events. The frozen lab baseline remains unchanged.

Typecheck and 25 focused AI tests pass, including a UTC New Year boundary. Two real local-model
checks answered the year with 2026 and the date with Sept 14, matching UTC at execution time. No
active matches were present before refreshing the port-3000 game server.

## Private live typing context

Prompt v22 can use a human contestant's unsent live-chat draft for wording habits and response
intent. Client updates are capped at one per 300 ms and only sent from the human live composer, with
a visible disclosure. Drafts do not trigger extra model calls. Each normal invocation gets a
snapshot of the current draft; later edits do not rewrite an in-flight generation.

Drafts remain in memory, expire after 15 seconds, and clear on send, deletion, disconnect or
closure. They are excluded from room views, saved match data and DevTools capture. Hidden-draft
instructions require an independent reply without copying or treating it as a public message;
existing escaping and encoded-payload masking apply. No judge typing is shared.

Validation: 54 focused game/AI tests (281 assertions), typecheck and build pass. Browser coverage
confirms draft frames, clear updates, absence from judge chat, and mobile composer usability. A real
local-model check with a competitive draft produced an independent short reply without tags. The
idle Wi-Fi server was refreshed for the change.

## Feedback workspace removal and evidence-based conversation control

Removed the home feedback link, lab UI/API, comparison generator, baseline/case fixtures, shared
contracts, tests and feedback-only controls/docs. Dropped lab tables from both local databases and
removed comparison-only request records and traces, the supplied feedback export and known scratch
comparison artifacts. Real match transcripts and accounting totals were retained. No history
rewrite.

Live scheduling now lives in `conversation.ts`. Shared judge questions wait for a stable human draft
or submitted answer; clear direct questions can proceed. Parallel replies do not trigger generic
acknowledgments and silence never triggers a new generation. Revised/deleted drafts invalidate both
in-flight results and queued unpublished replies. Reply timing adapts to recent human reply delays
and measured typing rates. No training or cross-match learning is involved. Prompt v23 prioritizes
response behavior before wording; old question-specific cue branches were removed. Bounded context
protects the current judge question when retaining a private draft.

Validation: full typecheck, unit tests and production build pass; all seven real-model browser
journeys passed, including the 90-second match, refresh, invitations and mobile composer. Controlled
regressions cover waiting, draft revision during generation and before publication, no idle replies,
recipient routing, cadence and context bounds. Actual model probes remain mixed: a refusal draft
produced "nope" and an ambiguous-game draft produced "depends on the game", but other runs still
acknowledged an unseen refusal or copied a short uncertainty phrase. Scheduling is deterministic;
semantic imitation by this model is not solved or claimed reliable. Conservative routing can miss
ambiguous peer-directed remarks. Further model-quality work should use actual gameplay feedback.

## Early judge verdicts

The judge can open the verdict form during live chat using Make a guess, return to chat without
submitting, or submit to end the match immediately. The opening still completes before guessing is
available. Final verdict and optional reason persist together; early completion locks all messaging
and audience votes, cancels pending AI output and releases unused capacity through the existing
finish path. The normal deadline-driven verdict flow is unchanged.

Validation: 58 unit tests, typecheck and build pass. A real-model browser journey verifies opening
availability, returning to chat, choosing a contestant and immediate shared reveal. Server coverage
checks authorization, durable verdict/reason, vote/message locking and late AI suppression.

## Prevent replies being starved by an active conversation

Inspected match d7080a05-d92e-4917-8566-f3befb01a9ca: six provider requests succeeded, but only the
opening was published. Public-input traces contained live answers; strict invalidation during
continued typing/new messages discarded unpublished output. Slow observed typing amplified the
window.

First replies based on submitted messages now survive intervening input during generation and
publication delays. Internal replyTo records the originating turn, so a late answer does not satisfy
a newer judge question. When delivery completes, the controller can handle that newer question.
Draft-derived replies still invalidate on edits/new input, continuation lines still stop on new
messages, and deadline/verdict cancellation is unchanged. No prompt changes or canned replies.

Validation: 59 tests, typecheck and production build pass. A regression follows the reported
sequence with new judge/human messages during generation and typing, verifies both answers arrive,
and checks that internal reply targeting is absent from public views.
