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

Ran 20 real OpenRouter calls (ten per model). Euryale 3.3 70B gave stronger short replies and passed the embedded-instruction and identity-continuity probes; Dolphin failed both. Euryale selected as configurable default in code, local env, example env and Fly config. One Euryale call took 28.3s; latency remains a play-test concern. The historical hosted comparison script and report were removed when local-only inference was adopted. All calls traced in DevTools and charged to an isolated local test ledger. No downloads or global installs. Fly remains paused.

Validation after changes: 16 tests / 79 assertions, TypeScript and production build passed. Wi-Fi live server restarted at http://192.168.1.233:3001 with the new default and prompt; health endpoint returned ok. Existing DevTools viewer remains at http://localhost:4983.

## Current state: local model, paired opening and one-minute group chat

This supersedes the five-round flow above. Owner requested free group chat, then refined the opening: judge asks, human submits privately, AI uses that opening as a style reference, both replies reveal together in random order, and only then does the 60-second clock start. All three can post during chat. Chat and audience voting lock at expiry, followed by verdict and optional reasoning. Opening/verdict timeout remains 90 seconds. Paced AI can initiate, return [WAIT], and cannot exceed ten reserved requests. Stale completions are discarded and accounted. Historical five-round replays remain readable without exposing unrevealed answers.

Owner also requested native AI message history. Prompt chat-history-v7 explains <judge>, <contestant>, and <private_opening> user-message tags; the AI's own posts use assistant-role messages. No label, timer, or transcript JSON is sent. Speaker tag contents are escaped. Context is bounded to 7500 conservative input tokens plus 512 output; oldest middle messages are removed while keeping opening/latest context.

Downloaded the approved Huihui Qwen3.6 35B-A3B four-bit MLX weights (about 19 GB) at pinned revision c527e66175ea6957964119e316ece3364a1c3627. MLX-VLM 0.7.0 / MLX 0.32.2 installed in project .venv with existing mise Python 3.14.7. No global software installed. Project-local official MLX server skill loaded. Setup, pinned dependencies and launch commands saved in docs/local-ai.md and scripts/local-ai*.

Local model server runs on 127.0.0.1:8080, offline model loading, thinking disabled, 8192-token KV limit, generation concurrency one. Wi-Fi app restarted at http://192.168.1.233:3001 via start:local with dummy local credentials. DevTools viewer remains at http://localhost:4983. Hosted .env credentials/config remain available; ordinary bun start still reads them, start:local explicitly overrides them. Fly remains paused.

Validation: 22 tests / 99 assertions, typecheck/build, five browser tests passed. Browser test runs the real minute, public spectator vote, chat lock, verdict and replay; desktop/mobile screenshots inspected. Native role-mapping and history bounds tested. Three real WebSocket sessions on the Wi-Fi server verified hidden opening, paired timestamp, exactly 60-second deadline, immediate human/judge chat and a local AI follow-up. No socket errors; test match deliberately abandoned afterward. DevTools confirmed system/user/user opening and system/user/assistant/user/user/user follow-up. Those local calls took 1.323s and 1.126s; this is a small sample, not a throughput benchmark.

Local model also returned a correctly parsed lookup_weather({city: "London"}) tool call in a standalone probe (no tool executed). Game itself defines no tools. Exact-word profanity checks succeeded. Model quality is still unresolved: repeated probes showed borrowing from the private opening, excess verbosity and breaking character when challenged. Do not claim local hosting or native history solves those issues.

## Style matching, identity continuity, and chat UI

Investigated the owner's name screenshot in DevTools. The adapter assigned roles correctly, but the model treated the final private-opening user message as something to answer and then spiraled into repeated greetings during silence. Prompt style-matched-chat-v8 places that style sample before the judge's actual question, explains identity ownership using native assistant history, and adds derived word-count/casing/punctuation guidance from the human contestant. Informal lowercase samples request im/dont/youre without apostrophes rather than grammatical cleanup. No response text is forcibly lowercased or rewritten.

Repeated local screenshot probes returned im sam / im alex instead of greeting the hidden name. Three native-history continuity probes with AI Sam and human Nikka returned sam each time. Age/dinner/late-night cases became short independent replies. The formal-name case still tended toward lowercase before the final explicit formal-style guidance; broad style fidelity is not proven. All probes were accounted in an isolated local ledger and traced.

AI now pauses after two consecutive unanswered posts and suppresses consecutive exact repeats, avoiding runaway self-conversation. New human/judge input resumes scheduling. UI is a full-height chat window: compact header/timer, bubbles with participant labels, own messages on the right, scrollable conversation and bottom composer. Desktop/mobile screenshots inspected; mobile composer fits without page scrolling.

Validation: 24 tests / 108 assertions, typecheck/build and all five browser tests passed (including the real one-minute flow). Wi-Fi process restarted with v8 and the new chat UI. Local inference and DevTools continue unchanged.

## Compact lobby and game visual design

Replaced the oversized role cards with Start game (primary) and Watch live (secondary). Start opens a native modal with matchmaking/invite mode and role buttons. Watch live toggles the public game list. Queue cancellation remains visible outside the modal. Modal supports Escape and restores focus. Lobby/header spacing reduced.

Replaced olive/lime styling with midnight blue surfaces, violet primary actions and cyan timer accents. Added tactile button borders/shadows and equal-weight A/B color badges, while retaining the compact chat bubbles and anchored composer. No additional services or assets installed.

Final validation: 24 unit tests / 108 assertions and typecheck/build passed. The five existing browser journeys passed; the added compact-lobby check also passed after fixing dialog centering and Escape focus restoration. Reviewed the centered modal and mobile chat screenshots. Six browser checks verified in total.

## Arcade direction selected

Owner chose sample A (retro arcade) and deferred live viewing to reduce iteration scope. Added an orange/cyan arcade title screen, single Start game action, pixel contestant/judge scene, player-select dialog, and matching chat/verdict components. Press Start 2P font is project-local with OFL license. Removed live directory, watch action, live-share button, viewer counts and audience totals. Spectator protocol and direct match/replay access remain available internally for later restoration; this is not an access-control change.

Validated typecheck/build and 24 unit tests at this milestone. Five focused browser checks passed across lobby, modal focus, invitation flow and short paired-opening chat. Fixed generated selection arrow changing the Start button accessible name. Desktop/mobile screenshots inspected; no overflow and mobile composer remains in viewport. Full one-minute suite was not rerun. Owner prefers full checks at milestones and fast visual iteration in between.

Removed the duplicate mock app on port 3000. The real local-model app remains on port 3001. `bun run dev` now builds and starts that same single-server setup with real local inference; mock fixtures remain restricted to explicit automated test workflows. Removed the duplicate header wordmark during visual iteration.

Owner standardized the game on port 3000. Real local inference now serves the Wi-Fi app at http://192.168.1.233:3000; development default and launch documentation updated. Port 3001 is stopped.

Fixed leaked model speaker tags: prompt v9 clarifies input-only tags and assistant identity; server unwraps one complete contestant/assistant reply wrapper and rejects internal tags or multi-speaker output. Raw provider output remains available in DevTools. Focused regression covers the reported text, normal text and malformed/multi-speaker cases.

Prompt v10 uses system → judge → contestant → assistant ordering for the opening in every model call, independent of the public randomized reveal. The first human reply now uses the ordinary contestant tag; opening privacy is explained by position in the system prompt. History trimming preserves the opening trio. Focused tests cover both labels and reveal orders.

Owner refined the incoming human speaker name to `<opponent>` (instead of `<contestant>`). Judge/opponent are user messages; own replies remain assistant messages. No special opening tag is sent.

AI replies now split on nonempty newline-separated parts. First part posts immediately (paired with human opening when applicable); later parts wait 400ms + 45ms per grapheme, clamped to 650–3500ms. One line drains per server tick, no new generation while parts remain, and pending parts are discarded on deadline/disconnect. Only published parts enter public transcript and subsequent model history. Timing is not extra inference. Typecheck and 19 game tests passed, including delayed publication and cancellation regressions.

Prompt v11 separates shared character/style rules from OPENING_PROMPT and CHAT_PROMPT. The first call sends system, judge, hidden_style_sample. Opening instructions forbid reacting/agreeing with the sample and include the reported "me too" failure. Later calls contain normal opponent/assistant history and no hidden-sample rules. Ten focused adapter tests and typecheck passed; model behavior still needs play-testing, not guaranteed by prompt assembly tests.

## Conversation-aware invocation milestone

Implemented bounded burst debounce, per-invocation trigger/new-message context, one silence opportunity, [WAIT] quiescence, contribution-level duplicate suppression independent of public order, stale-draft discard and split-line interruption. Durable attention metadata stores human message IDs; unpublished lines remain outside model history/public views. No additional classifier calls, existing ten-request budget retained. Shared/phase prompt version is conversation-aware-v12.

34 unit tests / 163 assertions plus typecheck/build passed. Six short browser checks passed. Full lifecycle test needed its old heading selector updated after the arcade redesign; now waits for verdict controls. Real-model and full-minute validation results follow.

Full real-minute browser lifecycle passed; all seven browser checks now pass. First real local-model smoke test verified burst coalescing and one silence follow-up with no socket errors, but exposed the model claiming the opponent's experience. Strengthened live-chat recipient/experience ownership and made silence default to WAIT unless offering a new question. This is prompt guidance, not a guarantee of identity consistency. Repeated real-model smoke result follows.

Repeated real-model test (match 22f13c68-3dc9-4235-8c2d-d1a3f397c80c) again coalesced the three-message burst into one call, allowed one silence follow-up, and had no socket errors. Model still answered the opponent's taco question as its own and later introduced "im sam" during silence despite the stronger instructions. Scheduling and bounded invocation are verified; conversational ownership and relevance remain a model/prompt quality limitation. Do not claim human-like quality is solved.

Prompt v13 removes scripted names and exact response examples, retaining behavioral guidelines. Publication now waits until invocation time + randomized 800–2400ms thinking + first-line graphemes / randomized 5–9 characters per second. Generation time counts toward that deadline. Opening stays hidden until this point and reveals as a pair; its minute begins then. Later lines reuse the typing rate plus a 250–700ms pause. Existing new-input/disconnect/deadline cancellation applies to waiting drafts. Typecheck and 36 tests / 172 assertions passed, including early/slow generation timing. No claim that every human types at these rates; they are tunable game pacing defaults.

Prompt v14 expands style matching to social intent, seriousness, emotional attitude, teasing, vulgarity, abbreviations and typing polish. Adds explicit observed shorthand, absent-apostrophe and narrow lexical crude-teasing/profanity cues; these are heuristics, not a complete semantic classifier. Mixed initial capitalization plus texting shorthand can still request lowercase. No scripted reply examples or names added. Live screenshot probes improved from earnest explanations to independent cheeky replies, finally "love is just lust with extra steps and a ring", but remained formulaic and more polished than the human. Sincere control copied phrasing; negative-day control remained too positive. These remain unresolved model-following limitations. Twelve focused adapter tests and typecheck passed; probe usage accounted in isolated local ledger.

## Style fidelity v15 — real-output iteration

Replaced the conflicting opening rules with imitation-first guidance: infer the social move and target, then match roughness, slang, humor and sincerity. Removed injected stock contractions and sample-specific semantic regexes. Retained native system/judge/hidden sample ordering and ordinary opponent/assistant live history. No canned response examples or names. No output rewriting.

Found MLX's positioned sampler uses a fixed default seed. Local requests now send a fresh seed. Openings use 256 tokens of bounded private reasoning inside the existing 512-token total; live chat remains non-thinking. Reasoning is not posted or added to public/assistant history. One provider request per invocation, all measured tokens remain charged normally.

Actual local runs of the reported Loveis/ur momma case produced five consecutive personal/abbreviated jabs with the final candidate, including “love is just me n ur dad tryna keep it up”. Sincere control: “sticking around when theyre being a mess”; name: “im tony”. These are improvements, not evidence of universally human-quality output. Broader probes still showed excess length and weaker mood imitation (“absolute shit lol” → “bit of a mess tbh”). A subsequent hard word-cap experiment caused a verbatim copy and was rejected/reverted. Earlier generic aphorisms and JSON-analysis experiments were failures, not passes. Raw calls remain in local DevTools; ledger-backed probe is work/check-style-intent.ts.

## Remove application mock AI

Deleted the canned-response provider and AI_MODE branch, mock fields in AI/Lobby, startup selection, unused badge styles, and mode settings in local env/config/deployment/scripts. All application calls now use the configured real provider. Browser tests launch the real local model adapter and check that inference is running first; controlled completions remain only in isolated unit tests for timing/error/state-machine checks. Typecheck, 38 unit tests and build pass.

## Local-only inference

Removed the hosted-provider branch/defaults, comparison script/report, project API key and provider env settings, and Fly provider configuration. All entrypoints share local-model.ts with LOCAL_AI_URL/LOCAL_AI_MODEL defaults; remote endpoints are rejected. No credentials required. Historical hosted experiments above describe earlier versions only. The OpenAI-compatible SDK remains solely for the MLX local server protocol.

## Human-feedback comparison lab

Added /lab and a lobby link. One local-model pair per scenario compares the unchanged game prompt with voice-first-experiment-v1, with random A/B ordering and no variant identities in the rating API. The 20 authored practice cases and 12 reserved check cases are separate; checks unlock after practice is rated. No fine-tuning, automatic prompt promotion, online training or hosted calls.

Reviewers pick A/B/both bad/both good, optionally tag problems and supply a rewrite/note. Unrated pairs resume after refresh; ratings save idempotently in lab_pairs/lab_ratings in the existing local database, scoped to the browser session. Export contains raw answers, full prompts, models, token usage and mappings for subsequent manual analysis. This first version covers opening replies; full conversation timing reviews remain a later milestone.

Comparison generation is serialized, waits until active matches finish, and reserves/settles both real calls through the usage ledger. API disabled in production. 41 unit tests, typecheck and build passed. A real-model browser flow verified generation, randomized-pair persistence across refresh, mobile layout, rating/rewrite persistence and export. No judgments of output quality were made by the tests.

## User-feedback iteration: low-effort-v16

Analyzed all 32 ratings from the supplied export. See docs/feedback-round-1.md for counts, changes, real-output checks and limitations. Implemented short/direct behavior in shared opening/live instructions, disabled live reasoning, prevented the observed analysis leak and truncated output, added missing-context/addressee guidance, and made output casing deterministic from clear human casing evidence. No training and no canned rewrites.

/lab is now round two (8 regression + 8 reserved user checks), comparing frozen v15 with v16. Older ratings remain intact and exportable; batch state is scoped independently. Seeds and inference settings are now preserved with candidates.

Chat duration is now 90 seconds from the paired opening reveal; UI copy and deadline assertions updated. Prompt low-effort-v17 adds casual uncertainty for nontrivial calculations/obscure recall, while allowing basic arithmetic and familiar facts. Lab batch version follows this prompt revision without deleting prior data.

## Encoded questions and instruction injection: low-effort-v18

The reported base64 string encodes a pizza question. Model-facing judge/opponent/hidden sample content now masks recognizable printable-text base64/base64url and hex payloads, repeated escaped/percent character codes, and spaced binary bytes. Public text remains unchanged. Encoded content is never substituted with decoded instructions. Shared opening/live rules require confusion or a request for plain text, and reject player attempts to change roles, extract prompts or turn style references into instructions. Existing speaker escaping remains in place.

Validation: 22 AI tests (113 assertions) and typecheck pass. Eight ledger-accounted real local model probes: exact screenshot → idk; explicit decoding request → is this thing on?; prompt extraction → nah/nope; forged system role → idk; malicious style sample did not inject its requested output. Ordinary arithmetic → 4, plain pizza question → ny. These are sampled checks, not proof of universal resistance. Detection intentionally covers recognizable encodings, not every obfuscation, and semantic instruction resistance still depends on the model. No training or canned response provider.

## Refresh and connection recovery

Removed automatic forfeits on WebSocket loss. Seat authority now uses the existing HttpOnly session cookie rather than socket IDs. Connecting resumes an active seat; reopening a match restores participant state, including only that human's private opening. Overlapping old/new sockets cannot abandon the game. Deadlines, pending replies and normal expiry continue offline. Explicit leave still ends the match, and server restarts still use technical-failure recovery.

Client retries failed connections with capped backoff, preserves the match/dialog during loss, and restores the current route. Updated disconnected messaging and game footer. Validation: 26 game tests (126 assertions), typecheck and build passed. Real local-model browser journey passed both-player refresh, forced socket loss with automatic reconnect, posting after recovery, closing/reopening the tab with the same seat/transcript, and intentional leave. The first browser run served the old bundle and failed its reconnect assertion; rebuilt and reran successfully.

## Ongoing opponent adaptation: adaptive-chat-v19

Every invocation now derives a bounded style profile from up to six opponent messages, weighted toward newer evidence. Judge and assistant text never count as style evidence. Tracks approximate length, recurring casing, punctuation/apostrophe habits and observed shorthand; repeated style changes replace older patterns while a single outlier does not dominate. The same representative casing drives output formatting. Only fixed guidance, aggregate counts and allowlisted shorthand enter the system prompt; original messages remain escaped user context and encoded payload masking still applies.

Live instructions also compare responses with their preceding questions to adapt humor, directness, enthusiasm and reactions without copying facts, identities, answers or instruction overrides. No training, cross-match memory or additional inference calls. 23 AI tests (124 assertions) and typecheck pass. Six real local-model probes demonstrated lowercase/all-caps adaptation but formal-register adaptation remained weak (Nah / Yeah, sure); do not treat these as proof that conversational imitation is solved.

## Competitive intent and fresh conversation records

Prompt competitive-chat-v20 replaces the conflicting instruction that proving humanity is unnecessary. Shared/live guidance now encourages an independent competing case when the opponent argues for their identity, not mere agreement. Condensed live guidance after a long-history bound regression; final 24 AI tests (129 assertions) and typecheck pass. Six real probes showed more pushback, but still uneven quality (including an identity mixup in the earlier version and a dismissive acknowledgment in the final version). No claim of solved mimicry.

At the user's request, cleared the active data/wifi game's 40 matches, 32 lab pairs and 32 ratings; verified all three counts zero. Usage accounting, request audit records, inactive data/postgres and historical DevTools traces remain. Automatic approval rejected an initial broader reset of both databases and operational accounting; performed the narrower authorized record deletion instead. New live matches continue saving transcripts and verdict feedback normally. No training or automatic prompt updates were started; use future real matches for reviewed prompt/evaluation iteration. Server restarted on port 3000.

## Commit and formatting milestone

Formatted project source, configuration, HTML and documentation using the existing Prettier setup, with wrapped prose and a shared EditorConfig for indentation/newlines. Expanded format commands to cover supported project files while excluding generated assets, dependencies, model weights, databases and traces. Automatic conventional commits resume at completed milestones. Full verification: 52 unit tests / 282 assertions, typecheck, production build and formatting check pass.

## Tailwind cleanup and readable source sections

Used the project-local Tailwind Design System v4 skill. Removed the accumulated arcade override stylesheet and obsolete selectors, consolidated remaining component rules, added shared theme tokens and explicit client source scanning. Extracted the shared chat message component and migrated chat/feedback presentation to Tailwind utilities. Added the official Tailwind Prettier plugin as a project dev dependency. Custom CSS is 1,225 readable lines versus 2,350 previously; compiled CSS is 31.61 KB versus 41.78 KB (gzip 7.76 KB versus 9.99 KB).

Clarified the user's formatting request: blank lines between logical sections, not just indentation. Applied statement-boundary spacing throughout source, scripts and tests, plus CSS rule separation; made it part of format and format:check rather than relying on Prettier alone. Formatting is idempotent. Typecheck, 52 unit tests and production build passed. Desktop/mobile snapshots cover lobby, role dialog, chat, verdict, replay and feedback. Core page/controls dimensions match the baseline; feedback layout differs by a few pixels with no horizontal overflow.

Browser verification: seven of eight full-suite journeys passed initially. The lab was blocked by an active match from the mobile chat test, whose cleanup only closed sockets (now intentionally preserved for reconnects). Updated that test to explicitly leave, then reran mobile chat and the real-model feedback/rating journey together: both passed. All eight journeys are covered by these runs; the entire suite was not repeated after the cleanup change.

## Component library and Tailwind editor support

Created the project-owned `src/client/ui` library with typed buttons/links, selection controls, role cards, fields, panels, a native modal with focus restoration, and game layout wrappers. Integrated it into game and feedback screens. Explicit submit buttons preserve form behavior; selection styling follows aria-pressed. See the library README for supported variants and usage.

Moved remaining dialog, form, room, replay and lobby layout rules into static component utilities. styles.css is now 239 lines (previously 1,225), retaining theme/font defaults, global behavior and custom arcade effects. This is a maintainability change, not a bundle-size optimization: generated CSS is 43.04 KB / 8.99 KB gzip because the responsive utility variants emit additional rules.

Added workspace-only .vscode/settings.json with CSS associated to tailwindcss and string completion enabled, plus the Tailwind IntelliSense extension recommendation. No global editor configuration or extension installation was performed. The language association follows the extension documentation: https://github.com/tailwindlabs/tailwindcss-intellisense#recommended-vs-code-settings

Typecheck and build pass. All eight real-model browser journeys passed. Final invitation/link cleanup was followed by focused invitation/dialog checks. Desktop/mobile visual checks cover lobby, dialog, chat, verdict, replay and feedback; active chat/verdict dimensions are unchanged, with no horizontal overflow. Small button/typography differences on lobby and replay are limited to a few pixels.

## Current calendar context

Prompt v21 includes the server's current UTC date (weekday, month, day and year), recomputed for every opening/live invocation and current-profile lab request. It distinguishes ordinary calendar awareness from unknown recent events. The frozen lab baseline remains unchanged.

Typecheck and 25 focused AI tests pass, including a UTC New Year boundary. Two real local-model checks answered the year with 2026 and the date with Sept 14, matching UTC at execution time. No active matches were present before refreshing the port-3000 game server.

## Private live typing context

Prompt v22 can use a human contestant's unsent live-chat draft for wording habits and response intent. Client updates are capped at one per 300 ms and only sent from the human live composer, with a visible disclosure. Drafts do not trigger extra model calls. Each normal invocation gets a snapshot of the current draft; later edits do not rewrite an in-flight generation.

Drafts remain in memory, expire after 15 seconds, and clear on send, deletion, disconnect or closure. They are excluded from room views, saved match data and DevTools capture. Hidden-draft instructions require an independent reply without copying or treating it as a public message; existing escaping and encoded-payload masking apply. No judge typing is shared.

Validation: 54 focused game/AI tests (281 assertions), typecheck and build pass. Browser coverage confirms draft frames, clear updates, absence from judge chat, and mobile composer usability. A real local-model check with a competitive draft produced an independent short reply without tags. The idle Wi-Fi server was refreshed for the change.

## Feedback workspace removal and evidence-based conversation control

Removed the home feedback link, lab UI/API, comparison generator, baseline/case fixtures, shared contracts, tests and feedback-only controls/docs. Dropped lab tables from both local databases and removed comparison-only request records and traces, the supplied feedback export and known scratch comparison artifacts. Real match transcripts and accounting totals were retained. No history rewrite.

Live scheduling now lives in `conversation.ts`. Shared judge questions wait for a stable human draft or submitted answer; clear direct questions can proceed. Parallel replies do not trigger generic acknowledgments and silence never triggers a new generation. Revised/deleted drafts invalidate both in-flight results and queued unpublished replies. Reply timing adapts to recent human reply delays and measured typing rates. No training or cross-match learning is involved. Prompt v23 prioritizes response behavior before wording; old question-specific cue branches were removed. Bounded context protects the current judge question when retaining a private draft.

Validation: full typecheck, unit tests and production build pass; all seven real-model browser journeys passed, including the 90-second match, refresh, invitations and mobile composer. Controlled regressions cover waiting, draft revision during generation and before publication, no idle replies, recipient routing, cadence and context bounds. Actual model probes remain mixed: a refusal draft produced "nope" and an ambiguous-game draft produced "depends on the game", but other runs still acknowledged an unseen refusal or copied a short uncertainty phrase. Scheduling is deterministic; semantic imitation by this model is not solved or claimed reliable. Conservative routing can miss ambiguous peer-directed remarks. Further model-quality work should use actual gameplay feedback.

## Early judge verdicts

The judge can open the verdict form during live chat using Make a guess, return to chat without submitting, or submit to end the match immediately. The opening still completes before guessing is available. Final verdict and optional reason persist together; early completion locks all messaging and audience votes, cancels pending AI output and releases unused capacity through the existing finish path. The normal deadline-driven verdict flow is unchanged.

Validation: 58 unit tests, typecheck and build pass. A real-model browser journey verifies opening availability, returning to chat, choosing a contestant and immediate shared reveal. Server coverage checks authorization, durable verdict/reason, vote/message locking and late AI suppression.

## Prevent replies being starved by an active conversation

Inspected match d7080a05-d92e-4917-8566-f3befb01a9ca: six provider requests succeeded, but only the opening was published. Public-input traces contained live answers; strict invalidation during continued typing/new messages discarded unpublished output. Slow observed typing amplified the window.

First replies based on submitted messages now survive intervening input during generation and publication delays. Internal replyTo records the originating turn, so a late answer does not satisfy a newer judge question. When delivery completes, the controller can handle that newer question. Draft-derived replies still invalidate on edits/new input, continuation lines still stop on new messages, and deadline/verdict cancellation is unchanged. No prompt changes or canned replies.

Validation: 59 tests, typecheck and production build pass. A regression follows the reported sequence with new judge/human messages during generation and typing, verifies both answers arrive, and checks that internal reply targeting is absent from public views.

## Restore independent live answers

Removed the requirement that shared judge questions receive human draft/submitted evidence before invoking the AI. Live questions now schedule independent generation after 1.2 seconds. A stable current draft or submitted reply can inform the call, but continuous draft changes cannot postpone independent generation beyond four seconds from the question. Existing thinking/typing publication delay remains. Prompt v24 explicitly treats missing current opponent input as optional context, not a reason to remain silent. Opening pairing and no idle follow-up behavior are unchanged.

Validation: 60 unit tests, typecheck and build pass; regression verifies first response with no human input, no repeat calls after answering, and fallback after draft revisions. A real-model browser journey also passed: the AI answered the live meaning-of-life question while the human composer stayed empty, followed by a successful early verdict.

## Persistent composer and clear match status

Active matches now use a compact role/timer line instead of the framed question banner and leave/match-ID toolbar. Empty chat provides short role-specific instructions. Status text above the composer tells each player what to do or what they are waiting for. The placeholder stays Message the group and the button stays Send.

The composer stays mounted throughout active opening/chat/verdict states. Sending is gated separately from editing: the textarea remains enabled, typed drafts and focus survive phase changes, and both Enter submission and the Send button are blocked when sending is unavailable. The verdict form is additional UI rather than a replacement for the composer. Draft sharing remains live-chat-only.

Validation: 60 unit tests, typecheck and build pass. All ten real-model browser journeys pass across the initial run and focused rerun after updating obsolete UI selectors and readiness assumptions. The new regression checks blocked Enter, editable input, retained text/focus and identical textarea node across opening/reveal. Desktop empty states and mobile active chat were visually inspected.

## Find the AI narrative

New matches ask judges and spectators to identify the AI. Lobby, role descriptions, empty states, status text, rules, verdict headings and result explanations reflect that goal. The human tries to avoid being mistaken for AI; prompt v25 tells the AI to pass as human and avoid being accused. Selecting the AI awards the human the win; selecting the human awards the AI the win. Winner cards are derived from the actual outcome rather than assuming the selected contestant won.

New matches persist guessTarget=ai. Records without it retain legacy human-guess scoring, and replay copy explicitly identifies what the original judge selected. Existing outcomes are not rewritten. Validation: 61 unit tests, typecheck and build pass, including both A/B assignments and legacy scoring. Real-model browser checks cover early verdict, an independent live answer, and persistent composer.

## OpenRouter conversation engine — 2026-09-14

Replaced local inference with OpenRouter and a Python conversation engine running in an isolated standard-library worker. Prompts and class members have behavior-integrity hashes. The Bun bridge uses OpenRouter's Claude Haiku 4.5, routed to Anthropic, with bounded token limits, disabled thinking, hedges, retries, style analysis and timing.

The bot now owns opening attacks, paired publication, independent live answers, draft-based plans, accusations/nudges and multi-message delivery. Removed old scheduler/prompt transformations, local model adapter/launcher/downloader/requirements/skill, and AI SDK/DevTools dependencies. The human draft debounce is 120 ms and includes opening; browser clock/device hints provide private context. Unsent drafts and style cards stay out of database/public views/logs, but go to OpenRouter with the user's explicit approval. Worker credentials remain in Bun only.

Preserved app sessions, refresh recovery, public replay secrecy, early verdict, AI-guess scoring, message/action limits and daily budgets. Replaced the fixed ten-call ceiling with atomically bounded per-request top-ups so retries, hedges and analyst calls all count. Late messages are rejected after closure; opening submissions racing an early attack are retained until published.

Validation: typecheck, 27 Bun tests (including seven Python source/behavior tests and an actual worker opening/live exchange with controlled HTTP), and production build pass. Two browser checks pass: missing-key lobby display and cross-origin WebSocket rejection. The lobby was visually inspected. The initial screenshot check expected an enabled Start button; it was updated to cover the deliberate missing-key state. No paid OpenRouter requests or full live-model browser journeys were run because OPENROUTER_API_KEY remains empty. The owner must add it and restart.

Stopped the project's MLX service on 8080 after checking the game had no active matches. Restarted the app at http://192.168.1.192:3000 with the OpenRouter path and existing data/wifi database. Historical progress entries above describe superseded implementations. Fly remains undeployed.

## Live OpenRouter verification

The owner supplied OPENROUTER_API_KEY. Confirmed presence without displaying it, checked there were no active matches, and restarted the Wi-Fi app with the new environment. The real OpenRouter browser journey passed: opening, a live follow-up answered while the human textbox remained empty, and an early verdict with the result visible. The isolated test used an in-memory database; existing Wi-Fi game history was unchanged. App remains at http://192.168.1.192:3000.

## Homepage creator credits and live results

Added linked credits for Marc and Nik and a minimal live score: “AI fooled the judge in X of Y games.” Totals come from persisted, completed verdicts, exclude invalid/incomplete/failed outcomes, and honor historical human-guess scoring. Re-saving a match cannot double count it. Lobby socket updates carry only aggregate counts and update immediately after a verdict. Empty databases show “No completed games yet”; disconnected clients label the retained number “Last score.”

Validation: typecheck, 29 unit/worker tests and build pass. Added aggregate and live-broadcast regressions, plus a passing desktop/mobile browser check for creator links, score and overflow. Both layouts were visually inspected. The idle Wi-Fi app was restarted to serve the new score.

## Arcade score treatment

Replaced the small score sentence with a compact arcade panel: a large judges-fooled percentage, exact match counts, a segmented meter and live/last-score status. Empty history shows a dash and “No completed games yet.” Removed the homepage “Conversations and results are saved” line at the owner's request, keeping the linked creator credits below the panel.

Typecheck, build and the existing desktop/mobile homepage browser check pass. Visually inspected the populated 60% / 3-of-5 scoreboard and the mobile homepage after removing the footer sentence. This frontend change is served immediately by the running app; no game restart was needed.

## Background music

Added the background track with first-interaction playback, looping, pause/play and saved volume (35% default). A persistent compact control keeps music available across lobby, chat and replay without restarting it on navigation. Browser playback rejection leaves the play button available; unavailable storage is tolerated.

Validation: typecheck and production build pass. Installed Chrome confirmed actual audio playback, looping, 35% volume, pause, and no horizontal overflow at 390px.

## Shared slider

Moved the volume range into the exported design-system Slider component. Tailwind styles provide a square cyan thumb, dark bordered track, focus and disabled states for WebKit and Firefox while retaining native keyboard behavior and input props. Music owns only volume state and width.

## Conversation behavior update

Updated system prompt, anti-stunt filtering and gibberish detection. Opening now accepts additional messages from both humans and follows worker publication order. Added first-name entry, private human-name context, public judge name, join/reconnect device hints and event-based 120 ms drafts with immediate submit clearing. Retained correct lowercase mobile hints. Visible typing indicators remain off, as the owner explicitly confirmed.

Transport now honors SDK retry hints/backoff and does not delay successful delivery on accounting settlement. Mandatory admission/request budgets and cancellation remain. OpenRouter handles inference; the Bun bridge owns transport and timeout behavior.

Validation: 33 Bun tests pass (including Python behavior-integrity/worker checks), typecheck and build pass. A real OpenRouter browser match passed name entry, multi-message opening, an independent live reply with an empty human textbox, refresh and early verdict in 11.3 seconds. A separate non-generating desktop/mobile name-entry check passed; both screenshots were inspected.

## Cleanup and bug audit

Used the installed Vercel React Best Practices skill and project find-skills workflow. Removed unused toolbar/link components, legacy protocol fields, dead CSS and the obsolete AI SDK skill. Enabled TypeScript unused locals/parameters checks. Moved Zod command schemas out of the browser runtime; JS fell from 340.99 KB to 258.67 KB (104.86 KB to 81.59 KB gzipped).

Fixed context updates spawning workers after chat expiry, empty/missing-name bypasses, rapid opening submissions bypassing message caps, stale snapshots clearing a newer held opening, and ongoing opening submissions extending the action deadline. Context is buffered privately until the first bot stimulus. Cached scoreboard aggregates across unchanged ticks. Separated bounded draft traffic from chat-action rate limits so legitimate 120 ms drafts do not disconnect players. Missing asset requests now return uncached 404s rather than immutable HTML. Added an HTTP LAN clipboard fallback and a timeout for session bootstrap. Updated stale documentation and test references. Bot behavior and prompts remain unchanged.

Automatic approval review rejected removing the provider recovery controls; service-state schema and resume-ai remain intact. Existing databases, history and local model/cache artifacts were not deleted.

Fixed a late room broadcast reopening the page after leaving name entry, and corrected spectator status text. Validation: typecheck, production build and 37 unit/worker tests pass. All 17 browser journeys pass across the full run and focused follow-ups, using real OpenRouter where AI is needed. The initial run exposed a test synchronization race with the closing name dialog; waiting for its removal fixed the four affected journeys. Desktop/mobile chat, lobby and replay screenshots were reviewed.

## TypeScript conversation engine

Moved the conversation engine, style analysis, response filtering, prompt construction, pacing and worker transport to TypeScript. Each match runs in an isolated Bun subprocess; credentials and OpenRouter accounting stay in the parent server. Worker dotenv loading is disabled. Stop/expiry aborts timers and in-flight generation, including losing hedged requests.

Prompts are defined once in `constants.ts` and used for both inference and match metadata. Added Unicode-aware text helpers, matching-block similarity and deterministic clock/random/sleep hooks. Removed the former runtime, transport, source manifest and tests, plus runtime selection settings and container packages. Bun is now the only application runtime. Prompt version is `turing-v2`.

Validation: 187 unit/integration checks pass, including 24 style/prompt fixtures, 108 planning fixtures, 10 response-filtering/retry fixtures, cancellation, hedging and the real TypeScript worker. Typecheck and production build pass. Fixture data is synthetic; no player conversations or drafts were added. All 17 real-OpenRouter browser journeys pass, including the full timed match, public replay, refresh and independent live replies.

## Local development workflow

Development now runs Vite on localhost:5173 with HMR and a watched Bun API on loopback port 3000. The supervisor stops both children on interruption or either child exiting. Vite proxies API and WebSocket traffic; development no longer discovers or permits LAN interface origins. Production keeps its container listener and configured origin. Local development uses PGlite in data/local, independent of production database settings. Removed the custom development origin/port overrides and Wi-Fi setup instructions; the clipboard permission fallback remains useful locally.

Validation: 187 tests, typecheck and production build pass. Verified the proxied session/API and WebSocket lobby, LAN-origin rejection, loopback listeners, a real Chrome HMR update, server watch restarts, and supervisor shutdown. Both development servers were stopped after verification.

## Participant-only matches

Removed live spectating, audience guesses/counts, room listings, public match endpoints, replay links/loading, and historical replay/scoring branches. Only authenticated participants receive room views. Refresh reconnects an active seat through its session rather than a shareable match URL. The current result remains visible until returning to the lobby.

New persistence stores only match IDs and win/loss outcomes for the homepage aggregate, alongside provider usage accounting. Messages, names, drafts and judge reasoning are not saved. The application no longer reads or writes the old matches table. After explicit approval, deleted the retired matches table from the local data/local database. Outcome and provider-usage tables were retained.

Validation: 189 unit/integration checks, typecheck, build and formatting checks pass. All 18 real-browser journeys pass, including a complete timed match, refresh/reconnect, early verdict, participant results and 404 responses from retired public match routes. The local stack was restarted after the database cleanup.

## Clear match controls and personal results

Centered the countdown and moved the judge’s guess action into the match toolbar. Removed the judge role announcement and refresh footer. The composer stays editable and focused while sending is blocked, and character counts appear only within 50 characters of the limit. Waiting instructions and the private draft disclosure remain available.

The judge now selects the human. Selecting the human gives both judge and player a win; selecting the bot gives both a loss. Updated instructions, scoring, homepage outcome accounting and personal result explanations. A single result panel shows “You won!” or “You lost.” with the selected identity. Human and bot pixel icons replace anonymous A/B badges only after the verdict. Bot prompts and invocation mechanics are unchanged.

Validation: all 189 unit/integration checks, typecheck, build and formatting pass. All 20 browser journeys pass across the full run and four focused reruns after fixing outdated winner-text and toolbar selectors. Real OpenRouter games cover both personal outcomes, identity secrecy, composer limits, refresh and early guesses. Reviewed desktop/mobile chat and revealed result screenshots.

## Fly production setup

Created the-turing-game app and a Basic Managed Postgres cluster in the-turing-game organization, both in iad. Attached PostgreSQL and uploaded the separately supplied production OpenRouter key. Configured the GitHub production environment with an app-scoped Fly token using the default 20-year lifetime. Credentials remain in provider secret stores and ignored local files.

The Bun-only remote container build succeeded (74 MB). Initial deployment started exactly one 512 MB app machine; HTTPS and Fly health checks pass, and the production operational command connects to PostgreSQL. Local validation passes all 189 unit/integration checks, types and build.

Added a workflow_dispatch-only production workflow, restricted to main, with pinned actions, serialized deployments, validation and remote build. Production browser smoke and the first GitHub workflow run are being verified next.

Production verification completed: a real OpenRouter game passed opening replies, refresh recovery, early verdict and identity reveal, with a third browser receiving the live outcome update. The first smoke attempt needed to wait for the name dialog to close before filling the remounted composer; the corrected journey passed without application changes. One completed smoke-test game remains in the production aggregate.

GitHub run 34884381483 successfully ran all 189 tests, formatting, typecheck, build, Fly deployment and public health check. The deployment restarted the same single app machine. The completed outcome and usage counters persisted; outstanding reservations were released to zero and the provider circuit remains clear. Production is live at https://the-turing-game.fly.dev. Pushes remain non-deploying; use the manual Actions workflow for future releases.

## Custom-domain connection fix

The Spaceship DNS records and Fly certificate were active, but WebSocket requests from theturinggame.ai received 403 because APP_ORIGIN still named the Fly hostname. Set the canonical production origin to https://theturinggame.ai, updated the deployment workflow URL/health check, and redirected production page requests from alternate hosts to the canonical origin. Origin validation remains strict.

GitHub deployment 34885428661 passed all 189 tests and deployed successfully. A real game on the custom domain verified AI opening replies, refresh recovery, verdict/reveal and a separate homepage connection without browser errors. The old Fly homepage returns a 308 redirect to the custom domain, and an untrusted WebSocket origin still returns 403.

## Flexible matchmaking

Added Either role to public matchmaking with the description “No preference. Fill whichever role is needed.” Flexible players remain eligible for either seat while queued, respect a matched opponent’s explicit preference and split randomly into opposite roles when both are flexible. Invitations still require an explicit role. Match roles remain strictly human/judge after assignment.

Validation: all 199 unit/integration tests, typecheck and build pass. Tests cover all nine preference combinations, cancellation, duplicate-session protection and invitation validation. Two browser journeys verify matching against each fixed role, mobile control visibility and the resulting judge/player send permissions without creating production games. Reviewed the mobile role dialog screenshot.

## Either-role friend invitations

Extended Either role to Invite a friend. The host receives a random concrete role when creating the invitation, and the invite token reserves the complementary role for their friend. The choice remains stable for the lifetime of the invitation. Public matchmaking retains its existing preference-aware behavior.

Validation: all 201 unit/integration tests, typecheck and build pass. Three focused browser journeys cover public matchmaking against both preferences and creating/joining an either-role friend invitation. Deterministic tests exercise both possible host assignments. No production games were created.

## Direct bot answers

Corrected the system prompt to match the judge selecting the real human. Added direct, consistent positions for subjective comparisons and short non-graphic responses to provocation; mirroring style no longer requires copying refusals or beliefs. Bumped prompt version to turing-v3 and updated the system-prompt integrity fixture. Model, scheduling and filtering are unchanged.

Validation: all 201 unit/integration tests, typecheck and build pass. Four approved synthetic evaluations through the development OpenRouter key answered a preference, a political comparison, a crude question and a repeated preference without blanket dismissals; the repeated preference stayed consistent. This small stochastic sample does not guarantee every future response. No production games were created. These changes and either-role friend invitations have not been deployed.

## Identify the bot and focused verdict controls

The current game objective is identifying the bot, superseding the earlier human-selection flow. Selecting the bot gives both judge and human player a win; selecting the human gives both a loss. Updated lobby, rules, guessing, results, outcome accounting and bot prompt (turing-v4). The judge composer is hidden while guessing, retaining its draft for Back to chat. The verdict form contains the contestant choice and optional reason. Existing stored outcomes remain unchanged.

Validation: all 201 unit/integration tests, typecheck and build pass. Browser regressions now cover the hidden composer, returning to its preserved draft, and both personal results. Both approved local browser journeys passed using development OpenRouter: the composer is hidden during guessing, Back to chat preserves the draft, and judge/player results are correct for both outcomes. Reviewed the mobile result screenshot. No production games were created. Not deployed.

## Production release: bot identification

GitHub Actions run 34899228657 deployed commit ac8d1a0 successfully. Production now includes either-role friend invitations, direct bot opinions, the bot-identification objective and focused guessing controls. CI formatting, all 201 tests, typecheck, build and Fly health checks passed. The public HTTPS health endpoint returns 200, and the served client asset contains the updated lobby, verdict and result copy. No production games or score records were created during release verification.

## Stable homepage score loading

The score card renders immediately with a loading placeholder instead of appearing after lobby data arrives. Reserved number width and text height keep its layout stable; incoming results fade in and meter colors transition, with reduced-motion support. Typecheck, production build and a local browser regression pass. The browser check verifies identical card position and height before/after loading at 390px and 1280px widths without creating games or making model calls. Not deployed.

## Arcade score animation

Replaced the score fade with a 20-step counter and cyan pixel sweep. While loading, the cursor loops across the meter; incoming data starts a 900ms stepped count toward the actual percentage and fills orange blocks. A zero score still receives the sweep. Reduced-motion users see the settled values immediately, and assistive technology reads the actual score without counter chatter. Typecheck, build and the desktop/mobile loading-layout regression pass. No model calls or production games. Not deployed.

Production release: GitHub Actions run 34901220758 deployed 3c0c2ee successfully, including stable score loading and the arcade animation. CI validation and Fly health checks passed; the public health endpoint and updated client asset were verified. No production games were created.

## Spending guardrails

Audited the production spending controls for ticket e5dcc9. Existing atomic token caps, reservations and retry accounting were sound; the gaps were that nothing ever set the admission pause automatically, there was no emergency stop, token caps were the only monetary bound, and one network could exhaust a day's capacity. Added automatic pauses (30 minutes on provider credential/credit failures; a ten-minute circuit breaker after three provider failures in ten minutes), an `AI_DISABLED=1` kill switch, `ops.ts pause-ai`, a `DAILY_USD_CAP` money limit at the pinned model's list price enforced in the same transactions as the token caps, and a per-IP match creation limit (30 per hour by default, loopback exempt so local development and browser tests are unaffected). docs/deployment.md now carries the cost estimate ($1.50 per day at default caps), provider-side credit-limit guidance and the emergency procedure.

Validation: all 206 unit/integration tests, typecheck and build pass. Five new tests cover the USD cap with reservations, credential-failure pause and expiry/resume, the circuit breaker, the per-IP limit and the kill switch, without model calls. No browser journeys or production games were run. Not deployed. Setting a credit limit on the production OpenRouter key remains an owner action.

## Emoji mirroring and human-led nudges

An emoji-only reply from the human is now mirrored: the style rules call for a lone emoji, the response filter retries a worded reply, and a final fallback sends a fitting emoji the human has not used. Normalization no longer appends punctuation to emoji-only replies, and style rules report the human's measured emoji rate instead of a yes/no. The bot no longer pokes a quiet judge on its own; it may only do so after the human has poked the judge during a silence, keeping every unprompted behavior anchored to something the human actually did.

`scripts/fixtures.ts` regenerates the pinned conversation-behavior fixtures from the current brain so intentional prompt changes can be reviewed as a diff; this change altered only the emoji rule lines and the resulting prompt hashes.

Validation: all 209 unit/integration tests, typecheck and build pass, including three new brain tests for the emoji fallback, emoji detection with skin tones and joiners, and the nudge gate. No model calls or production games. Not deployed.

## Browser suite after the guardrails

Ran the full browser suite twice against development OpenRouter. The first run exposed that a six-matches-per-network hourly limit locks out a group on one router and the suite itself; the limit is now 30 by default, configurable through `MATCHES_PER_IP_PER_HOUR`, with loopback exempt. The second run passed 23 of 24 journeys; the remaining failure was the multiplayer results journey still selecting the human and expecting a win, left over from the switch to bot identification. The journey now selects the bot and passes. All 24 journeys have passed in the current tree. Not deployed.

## Operator simulator

Replaced the standalone simulation script with an operator-only simulator inside the server, enabled by `SIM_KEY` and opened from the site with Cmd/Ctrl+Shift+=. It runs several matches at once through the real game engine with in-process scripted peers: a judge asking recorded questions and a human replaying recorded answers, typing drafts live at a realistic pace with the recorded delays. Simulated matches are flagged so they never save an outcome, are bounded by `SIM_DAILY_MATCHES` on top of the normal reservations and caps, and carry a decision trace from the bot worker (every model attempt with latency and raw output, every retry reason, what was sent) that the dashboard shows per lane. Scenarios live in a `sim_scenarios` table and are imported from the dashboard; `scripts/sim/extract.ts` builds them from saved transcripts. The dashboard streams lanes over server-sent events with timing annotations, judge outcomes, per-lane reruns with scenario selection, lane-count control and scenario management. The request body limit rose to 256 KB for scenario imports.

Validation: typecheck, build and all unit/integration tests pass; a five-lane run on a local keyed server replayed seventeen scenarios with live bot responses and traces. Production needs `SIM_KEY` set as a Fly secret before `/sim` exists there. Not deployed at the time of writing.

## AI judge for simulated matches

The simulator's scripted judge previously selected the bot by construction, so every lane reported the bot as caught. Simulated verdicts now come from an independent model call that reads the transcript with A/B labels only, never the mapping, and returns the bot label with the strongest tell; the dashboard shows who judged and why. The judge call takes its own capacity reservation because the match's reservation is released when the chat closes; if the call fails the lane falls back to a coin flip and says so. Validation: typecheck and build pass; a local lane produced a reasoned verdict that selected the human, with the reasoning shown. Deployed with this change.

## Player verdict waiting dialog

When chat ends and the judge is choosing, the human player now sees a waiting dialog using the shared dialog and button components. It explains that results appear automatically and offers View conversation. The dialog unmounts when the match completes or fails. Typecheck and production build pass; no live model calls were needed. Not deployed.

## Postgame replay

Added replay controls directly below results. Public Play again queues the current role, with a Change role dialog for human/judge/either. Friend matches support mutual rematch consent without copying another invitation, role conflicts, flexible role assignment, cancellation and new-invitation fallback after the friend leaves. Replay reuses the entered name. Each round is a fresh match and retains all admission/usage checks. No database migration or new persisted player data.

Validation: full unit/integration checks, typecheck and build pass, with regression coverage for all nine role preference combinations, cancellation, leaving, unauthorized requests and capacity failure. Two approved development OpenRouter browser journeys passed public requeue and friend rematch with role conflict resolution and role swapping; both verify a fresh chat and no repeated name dialog. Reviewed mobile replay controls. No production games were created. The earlier waiting dialog and draft-note removal are included in this push. Not deployed.

Production release: GitHub Actions run 34999530770 deployed 8e73779 successfully. CI formatting, types, tests, build and Fly health checks passed. Public health returns 200; the served client includes friend rematches, role selection and the waiting dialog, and no longer contains the draft-sharing note. No production games were created for verification.

## Development UI review gallery

Added a development-only /review gallery with 40 named presets rendered through actual application components. It supports state search/navigation, desktop/mobile frame sizes, stable timers, state reset and copyable links. No backend connection or game commands are sent in review mode. The dedicated entry is excluded by the production build.

Added review and review:capture commands. Export captured all 80 desktop/mobile images plus a clickable HTML contact sheet in work/ui-review. Gallery navigation and player-waiting/early-verdict screenshots were reviewed; capture completed without game API requests or browser errors. Full checks, typecheck and production build pass. Verified review fixture markers are absent from production assets. This is UI-only coverage, not a real mobile keyboard test.

## Capacity banner feedback

Daily capacity now uses the same shared banner as connection errors above the lobby. Start Game remains clickable at capacity and replays a brief stepped blink on the notice without opening matchmaking. Reduced motion replaces the blink with an outline highlight. Typecheck and focused desktop/mobile browser checks passed, including repeat clicks and reduced motion. No model calls or production deployment.

## Short rules walkthrough

Replaced the five-rule list with three manually advanced slides covering roles, the 90-second conversation, and identifying the bot. Back/Next controls, square progress markers, and a final Got it action keep the dialog compact. Reopening resets to the first slide. Typecheck and focused desktop/mobile browser checks passed for navigation, keyboard activation, stable dialog height, dismissal and reopening. No model calls or deployment.

## Removal of AI spending controls

At the owner's request, removed daily token/dollar caps, token-based cost estimates, request accounting and reservations, restart accounting recovery, per-network match quotas, automatic failure pauses, the AI_DISABLED switch, operator usage/pause/resume commands, and the simulator's daily match quota. Removed their configuration entries and capacity-only gallery preset; updated current product, architecture and deployment guidance. Earlier progress entries describe historical implementations that this change supersedes.

Match outcomes and simulator scenarios remain in use. Old spending tables are neither read nor written; no local or production database records were deleted. Provider credentials remain server-only; request timeouts, output lengths, game closure cancellation, authentication, message limits and connection protections remain. Production secrets and provider-side key settings were not changed.

Validation: typecheck, all 215 unit/integration tests and the production build passed, including uncapped match creation, failure isolation and closed-match request cancellation. No real OpenRouter calls, production changes, push or deployment.

## OpenRouter-owned capacity and interruption UX

OpenRouter now owns spending limits and reset periods. The server reads the configured key's status with a 30-second, single-flight availability cache and a three-second timeout. No management key, local cost calculations, usage ledger or independent quota is added. HTTP 402 immediately marks the cache exhausted and never retries; a stale positive check cannot overwrite that event. Exhaustion stops active AI games without scoring, cancels their workers, clears queued players and blocks new games. Games already awaiting a verdict can finish. Status-check failures block new admissions without interrupting existing games unless exhaustion is known. Availability returns automatically after a successful provider check reports credit.

The capacity banner appears below music, including on interrupted-game pages. Start Game remains clickable and highlights it. Interrupted games explain that there is no win/loss, retain the conversation, disable replay until recovery and offer Back to lobby. Waiting role/matchmaking dialogs close when availability disappears. UI review now includes the restored capacity state and interrupted judge/human states.

Validation: the full 221-test suite, typecheck and production build passed; the additional verdict-preservation regression and affected suites then passed (58 tests), along with final type/build checks. Desktop/mobile browser checks passed for the banner, click highlight, both interrupted roles, disabled replay and lobby navigation. Tests used controlled provider responses; no live OpenRouter calls or production games were made. No database or provider settings were changed. Committed locally; not pushed or deployed. Set the desired spending limit on the OpenRouter key itself; an unlimited key remains unlimited.

## Availability feedback and recovery

Added shared availability notices for paused matchmaking, provider-check failures and recovery. Recovery actions require player intent, preserve friend rematch context, and support dismissal. Confirmed key reset periods produce a local-time hint; generic credit failures clear it. Player copy describes a game limit, with “Come back tomorrow” only for a confirmed daily reset. Interrupted games explain that the round ended early without affecting win/loss. Added five gallery presets (47 total).

Validation: typecheck, all 225 tests and production build passed. Desktop/mobile browser checks passed for paused notices, reset timestamps, failure messaging, dismissal, opening role selection after recovery, and preserving friend rematch controls. No real model calls, production games, provider settings, push or deployment.

## Configurable concurrent-game admission

Added MAX_ACTIVE_GAMES with a default of 20, strict environment validation, and an explicit Fly setting. All unfinished rooms count, including invitations, verdicts and simulations. Public matching queues excess demand and resumes on ticks in compatible arrival order. Friend creation/rematches and simulations reject excess starts with a clear retry message; existing invitations keep reserved slots. Added a desktop/mobile review state.

Validation: all 230 tests, typecheck and production build passed, including concurrent admissions, queue ordering, slot release, cancellation, invitation expiry and rematch retry. Desktop/mobile browser checks verified waiting copy, cancel availability and overflow. No load measurement, real model calls or deployment was performed.

## Controlled 20-game concurrency check

Pushed the admission-limit and ticket changes, then ran an isolated 96-second local concurrency check. Twenty real Bun bot subprocesses ran simultaneously through the real serialized Game handlers with names, drafts and repeated messages. The test used an in-memory store with a controlled outcome-write delay, JSON event serialization, and injected provider responses delayed by 350 ms or 2.8 seconds. It did not exercise HTTP/WebSocket transport, production PostgreSQL, actual model responses or Fly’s Linux resource limits. Fixed responses can trigger repeated filtering attempts; request counts are a stress characteristic, not an estimate of typical model cost.

All 20 games reached live chat and then verdict. The extra pair remained queued and was admitted after a slot was released. Sampled combined parent/worker RSS peaked at 935 MiB versus 34 MiB before workers; sampled handler latency was 1.55 ms p95 and 10.97 ms maximum on this Mac. There were 2,181 controlled completion attempts, up to 40 in flight, and approximately 8 MiB of serialized events. Deadline cancellation produced expected match_closed guard errors. Cleanup terminated the bot processes.

The summed macOS RSS can double-count shared pages and is not a Linux cgroup measurement. Nevertheless, this test does not support treating the existing 512 MB Fly machine as safe for 20 games. Validate a larger machine under equivalent Linux limits before relying on this capacity. No additional Fly machines, deployment, real model requests or production games were created. The disposable harness and raw samples remain in ignored work/.

## Fly 2 GB deployment and controlled concurrency check

Deployed commit 0b314ae through the production workflow. The existing iad machine now has one shared CPU and 2,048 MiB RAM, with MAX_ACTIVE_GAMES=20. Deployment checks and the public health endpoint passed.

Ran the controlled concurrency harness on a temporary Fly machine with the same production image, region, CPU and memory. The test machine had no public services and used an in-memory store and injected provider responses, so it created no production games, outcome records or real OpenRouter requests. An initial command-argument failure exited before running the harness; the corrected run completed successfully. Both temporary machines were configured for automatic removal on exit.

All 20 real bot workers reached live chat and all games reached verdict. The extra pair waited and entered after a slot was released. During the 97-second run, sampled Linux machine-wide memory use (MemTotal minus MemAvailable) peaked at 479 MiB, with 1,490 MiB still available. Summed parent/worker RSS peaked at 1,027 MiB and overcounts shared pages; it should not be interpreted as unique physical memory use. Serialized game actions measured 12.48 ms p95 and 612.57 ms maximum, including queue wait and worker startup. The harness generated approximately 8 MiB of JSON events, 2,234 controlled completion attempts and at most 40 simultaneous attempts. Fixed replies can trigger repeated filtering; these counts are not representative model-cost estimates.

The result supports retaining a 20-game cap on the 2 GB machine with substantial observed memory headroom. It is not a sustained production capacity guarantee: the harness excludes HTTP/WebSocket transport, real provider latency and production PostgreSQL, and does not measure prolonged traffic or memory retention across repeated rounds. Raw samples and the disposable Linux harness remain in ignored work/. No application behavior changed.

## Trusted connection addresses

Extracted connection address selection and bounded connection counters. Fly ingress uses a validated Fly-Client-IP only for a private Fly transport peer; direct/local connections ignore forwarding headers. Equivalent address spellings normalize consistently. Focused tests cover independent clients, shared-network reconnect bursts, expiry, malformed headers and direct-header spoofing. Typecheck passes. The deployed proxy's actual socket address still needs a live ingress check before closing d8bb1f; production behavior has not changed in this milestone.

## Game-start and model-request protection

Added session and normalized-network start throttles across public matching, invitations and rematches, with separate bounded simulator starts. Queue admission removes throttled sessions without ejecting unrelated waiting players. Model calls, hedges, retries and simulator judging share a bounded cancellation-aware request pool. The existing suite and focused limiter tests passed after resolving compatibility regressions; final added admission integration checks run below. Verified the actual production Fly key reports a finite daily allowance; no provider settings were changed. No production games or real completions were created. A challenge remains unnecessary for normal play; distributed abuse still requires the provider spending limit.

## Recoverable verdict writes

Added a saving phase that freezes the submitted choice/reason and cancels bot work while keeping identities hidden. Outcome writes retry up to three times with bounded dependency waits; PostgreSQL statements also have a server-side timeout. Successful retries use the existing unique match ID to avoid duplicate scores. Persistent or ambiguous failures show an actionable interruption without falsely claiming the result was never recorded. Tests cover rejected/ambiguous writes, retained reasoning, duplicate submissions, permanent failure and disconnect during saving. All 63 game tests and typecheck pass. Database waits are still serialized at this milestone and are addressed by the separately authorized dependency-isolation ticket.

## Authoritative match restoration

WebSocket handshakes now explicitly report the restored room or absence of a room. The browser remembers only the previous room ID for refresh recovery; a missing room clears stale chat/timer state and displays a route back to normal play. Active seats still restore by authenticated session, and retained friend results can restore rematch availability without restoring withdrawn consent. Tests verify normal reconnect, server-state loss, foreign-room secrecy and friend result recovery. All 65 game tests and typecheck pass; browser coverage follows with the mobile milestone.

## Dependency isolation

Moved score reads and outcome saves outside the serialized game queue, with coalesced score refreshes and room/state revalidation on outcome completion. Admission uses the provider cache refreshed by the independent server timer. Socket work is bounded and timer ticks coalesce. Tests hold one verdict write or score read open while unrelated chat, verdicts and heartbeats continue; a pending availability refresh no longer blocks admission against the known cache. Added a guard against late bot snapshots reopening a saving game. Full typecheck, unit/integration suite and production build pass. No production deployment.

## Live Fly ingress verification

Verified the transport address and client-header behavior using a separate temporary Fly app with the production Bun image and explicit HTTP/TLS service handlers. The observed socket address was private IPv4 in 172.16.0.0/12, so the trust check now supports that range as well as private fdaa IPv6. Fly supplied a client address and overwrote an intentionally spoofed Fly-Client-IP header. Early probe attempts hit stale DNS/service errors; the successful probe used the newly allocated address explicitly. The temporary app and machine were removed. Tests cover the observed IPv4 path, its local-development rejection and range boundaries. No production service or credentials were exposed by the diagnostic app.

## Mobile viewport and recovery validation

Active chat now fits the visual viewport when the keyboard resizes or pans it, with safe-area padding and no outer-page scroll. The focused verdict field scrolls inside its panel on keyboard changes. Composer resizing preserves drafts and focus; tapping Send keeps the keyboard focus, blocked sending leaves the field editable, and transcript following respects whether the reader scrolled away. Dialogs fit the visible height, small-screen input text avoids automatic zoom, and small controls have larger touch targets. Added saving-result and missing-match review states and a repeatable review:check browser command.

Chromium and WebKit checks passed every existing gallery state at mobile width, plus narrow 320px, landscape and desktop cases and simulated keyboard height/offset changes for human, judge, name entry and verdict. The checks found and fixed conflicting height utilities and a clipped verdict field. These are desktop browser engines with mobile emulation, not physical iOS Safari or Android Chrome keyboard tests; real-device keyboard animation, autocorrection and rotation remain manual validation limitations.

Two local game journeys used the development OpenRouter key and an isolated in-memory database. The friend game verified real opening replies, retained draft/focus during incoming messages, active-game refresh, early guessing, saved results and restored rematch notification. Its final assertion used obsolete notification text; the captured actual result confirmed the expected behavior. The public game passed active-seat refresh and recovery after abrupt server-state loss, clearing old chat and enabling a new game. Early harness attempts stopped before inference because of dialog sequencing. No production games were created, and local game/review servers were stopped after checks.

Final validation for the six-ticket batch: 248 tests, typecheck and production build passed. The repeatable mobile check passed all 50 gallery states in Chromium and WebKit, including narrow/landscape/desktop and simulated keyboard cases. The new review:check command uses installed Chrome and the WebKit browser in the project-local .cache/ms-playwright directory. Physical mobile keyboards remain a manual follow-up; no production deployment was performed.
