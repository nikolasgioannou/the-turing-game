# The Turing Game — agreed product specification

## Concept

Two humans participate: one contestant competing with an AI, and one judge trying to identify the human. Both contestants try to convince the judge they are human. Spectators can watch and guess. This is a deployed app, not a mockup.

## Match flow

1. On the main dashboard choose Play as human or Play as judge. Public matchmaking pairs opposite roles, without listing waiting rooms.
2. Alternatively create an invite room in either role and share a seat-invitation link. All rooms, including invite rooms, are publicly watchable; only the invitation permits claiming the other seat. Waiting rooms are not listed.
3. The judge asks the opening question. Contestants receive randomly assigned A/B labels fixed throughout the match.
4. Human commits an answer first. AI generates from game instructions, current question, previously revealed rounds, and the human’s submitted answer to this question. The AI can adapt its tone and length while composing an independent answer. Both answers are revealed atomically. Contestants see each other's revealed messages.
5. Judge asks the next question immediately; no extra next-round button. Five rounds, then mandatory verdict. No early guess.
6. Judge selects A or B as human and may add optional reasoning. Choice and reasoning are submitted before identity reveal. Correct choice means human and judge succeed; otherwise AI wins.
7. Spectators may choose A/B, revise until verdict, and see aggregate votes only after verdict. One vote per anonymous browser session; no accounts means this is casual voting, not fraud-proof polling.
8. A permanent public match URL shows completed transcript, identities, verdict, judge explanation and audience totals.

## Time and limits

The original five-minute proposal was replaced by five questions. Each human action has a 90-second deadline (including the verdict); while AI generates it has its own request timeout. Question limit 300 characters, each contestant answer 500, with Twitter-style live remaining counter and enforced submission limit. A separate UTF-8 byte ceiling (four times the character limit) bounds pathological combining-character input. Use Unicode grapheme characters consistently; this means a family emoji counts as one character, not Twitter's special URL weighting. Optional explanation has a 1000-character bound.

Disconnect or leave by either participant ends the match immediately once detected; no reconnection. Missing actions abandon the match. Provider failure ends it as technical failure. Preserve records; no win/loss for either case. Spectators disconnecting never end matches.

## AI

Use OpenRouter with configurable provider URL, credentials and model. Euryale 3.3 70B is the current play-test default after comparing ten scenarios each with Dolphin Mistral 24B Venice Edition. Prompt independent-style-v3 gives explicit style guidance and examples. The current human answer is a private style reference only: the AI must produce an independent answer, never reacting to, copying, or revealing knowledge of that pending answer. Previously revealed rounds are shared knowledge. Preserve the AI's own identity across rounds. Natural conversation including ordinary profanity is valid. The game is openly an AI-versus-human identity game; no external impersonation. See docs/ai-comparison.md for measured limitations.

Store questions, answers, verdict, optional explanation, timestamps, model, prompt version and provider metadata. How to use these records to improve/train models is explicitly deferred. Never expose reasoning traces or pending answers to spectators/judge.

## Capacity

Owner funds usage. App-level daily input/output-token caps independent of provider billing; initial settings 1,000,000 input / 100,000 output, reset at midnight UTC. Durable ledger and conservative reservations for full five-round matches prevent concurrent over-admission. Count actual reported usage; missing/ambiguous reports keep conservative charges. Include failed requests and retries. Provider credit limit is an additional safeguard, not our implementation.
When app allowance is exhausted, stop new matches and explain when it resets; viewing and replays continue. Reserve enough for started matches. Provider-wide outages or credit failures pause admissions and terminate affected matches cleanly with a technical-failure message. Operator can restore availability after fixing credentials/credits.

## Interface

Dark, restrained game-show working surface; mobile support. Every text, button and element must serve a specific purpose. No promotional hero, filler copy, decorative dashboards, waiting-room directory or fabricated activity. Clear two-column A/B transcript on desktop, stacked on small screens. Equal contestant styling and no timing/typing indicators identifying the AI. Dashboard contains role choices, invitation creation and live matches.

## Stack and working agreement

Bun, TypeScript throughout, Tailwind; Fly deployment. Agent chooses architecture, tools, documentation and tests. User suggested TanStack Start as an option, not a requirement. Conventional commits encouraged. Save project at ~/workspace/the-turing-game. No global installations without explicit approval; everything installed for the project stays inside it. Discover relevant skills using vercel-labs/skills/find-skills.
