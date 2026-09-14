# The Turing Game — agreed product specification

## Concept and participation

Two humans participate: a contestant competing with an AI, and a judge identifying the human.
Spectators watch and guess. This is a deployed-app project, currently iterating locally before Fly
deployment.

Start game opens a dialog to choose matchmaking or an invite room and then a role. Live viewing is
deferred from the interface: no Watch live action, game directory, viewer counts, live-share button,
or audience totals. Existing spectator protocol and direct match/replay URLs are retained for later
restoration. Invite links reserve the other seat. All matches, including invite rooms, are publicly
watchable. Fixed random A/B labels conceal contestant identities until the verdict. No accounts;
seats belong to a connected browser session.

## Paired opening, then 90-second group chat

1. The judge sends an opening question. The free-chat timer has not started.
2. The human submits their opening reply privately. The AI receives the question and this reply as a
   private style reference. Its reply must be independent and must not reveal that it saw the
   human's reply.
3. Both opening replies are revealed in a single update, in random order independent of A/B
   identity. They share a timestamp. The server starts the 90-second timer at this reveal.
4. The judge, human, and AI may all post freely in one chronological group chat. They may respond to
   each other and introduce topics. Messages appear immediately as complete messages. There are no
   turns after the opening and no typing/streaming indicators. All posted messages are shared
   context. During live chat, the human contestant also shares their current draft privately with
   local AI context (disclosed beside the composer); it is never shown to other players or saved in
   transcripts. Judge drafts are not transmitted.
5. At the deadline, chat locks, pending AI work is cancelled and late output is discarded. The judge
   then chooses A or B as human, with optional reasoning. The judge may also submit a verdict during
   live chat, ending it immediately. Identities and audience totals are revealed only after verdict
   and reasoning commit together.
6. Permanent public replay shows the transcript and result. Historical five-round replays remain
   readable; unrevealed historical answers remain private.

Spectators may revise their private guess until chat closes, then guesses lock. One vote per
anonymous browser session; participants cannot also vote. Correct verdict means human wins;
otherwise AI wins.

## Time and limits

The opening question, opening human reply, invite seat and final verdict each have a 90-second
human-action timeout. Opening AI generation has a separate 30-second timeout. The 90-second
free-chat clock begins only after both opening replies are revealed and never extends for new
messages or AI generation.

Messages have a 500-grapheme limit and a UTF-8 byte ceiling of 2000. Judge reasoning has a
1000-grapheme limit. Each human participant can send up to 30 messages per match, including their
opening. The AI has at most ten requests including its opening, reserved before admission. These are
abuse/capacity bounds, not turns. Shared judge questions wait for a stable human draft (800 ms) or a
sent answer (650 ms), letting the AI infer response behavior before replying independently. Direct
questions to the AI need not wait. After answering, parallel human replies do not trigger
acknowledgments; clear peer-directed questions can. Silence alone never invokes the model. The
controller passes the reply target and evidence type to the model. Revised/deleted drafts and
intervening messages invalidate draft-based work. Answers based on submitted messages survive new
conversation input, so typing delays cannot starve delivery. Only one request runs per match.
Generation runs immediately when eligible; publication waits for thinking plus length-based typing
time, calibrated to recent human response delays and observed draft typing speed. Newline-separated
parts arrive separately and new human messages cancel unsent parts. [WAIT] posts nothing and stops
reconsideration until fresh evidence arrives. These rules improve turn-taking, not a guarantee of
human-like text.

Explicit leave abandons immediately. A lost socket does not end the match: the client retries
automatically and the authenticated browser session reclaims its seat after reconnect or refresh.
Deadlines and pending AI work continue while offline. Provider failure ends as technical failure,
not a loss; preserve records. Spectator disconnection never ends a match.

## AI and storage

The game uses local models only. The current model is Huihui Qwen3.6 35B-A3B MLX four-bit on this
Mac, via the loopback OpenAI-compatible MLX-VLM service. See docs/local-ai.md.

Prompt competitive-chat-v23 distinguishes the private opening from the public chat, allows ordinary
profanity and exact-word matching, and prohibits quotation wrappers and narration. Its objective is
to stay in contestant character. Model instruction-following and conversational quality require
play-testing; no claim of guaranteed human-likeness.

Persist all submitted human opening replies, public messages, timestamps, judge verdict/reasoning,
model/prompt versions, provider metadata and usage. Hidden opening content and identity mapping are
serialized only for authorized views. How to use records for training remains deferred.

## Capacity and deployment

Local inference capacity is bounded. Provider-independent daily caps initially 1,000,000 input /
100,000 output tokens UTC. Reserve ten requests at 7500 input / 512 output tokens each before
admission; bound prompt payload conservatively and reconcile reported usage. Missing or failed
requests remain conservatively charged. At chat closure, release unused reservation; in-flight
charges remain until settlement. No automatic retries. Viewing/replays continue when new-match
capacity is exhausted.

Bun/TypeScript game and React/Vite/Tailwind interface. PostgreSQL production; local PGlite for
development. Single authoritative Fly machine with Managed Postgres planned, deployment paused
pending owner details. Local inference is for development; deployment inference hosting is
undecided.

Visual direction: retro arcade, orange/cyan contestant colors, pixel typography, title-screen lobby
and player-select dialog. Every UI element must serve a purpose. Minimal group chat, composer,
timer, verdict and audience controls. No filler, decorative metrics or artificial games.
Project-local installations only, conventional commits, maintained docs and AGENTS.md.
