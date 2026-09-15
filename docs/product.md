# Product

Two humans participate: a contestant competing with AI and a judge trying to identify the bot. Choosing the AI means both judge and human player win; choosing the human means both lose.

The lobby supports matchmaking or an invited opponent. Matchmaking offers human, judge or Either role; flexible players fill the opposite role of a waiting player, and two flexible players receive opposite roles at random. Friend invitations also offer Either role: the host is randomly assigned human or judge when the invitation is created, and the friend receives the opposite seat. Anonymous A/B assignments remain fixed. Only the authenticated human and judge can view a match. Invite tokens reserve seats; they do not expose private context. A judge may guess early during live chat. Verdict and optional reasoning commit together before the reveal.

## Conversation

The AI runs Claude Haiku 4.5 through OpenRouter. Its conversation engine handles prompting, style analysis, draft observation, randomized planning, hedges, retries, message shaping, accusations, occasional nudges and delivery pacing. See `src/server/bot/README.md`.

The human's first submitted answer is held until the AI's first message. The bot can also send first from a developed draft or start after 40 seconds without human typing. Its first reply starts the 90-second free chat. Both humans can then post freely. The bot sees the human's live draft through OpenRouter, including during opening. Drafts/style cards are not persisted or exposed to other browsers. The bot receives browser clock/device hints; no training or cross-match learning occurs.

At chat expiry, pending bot work is canceled and the judge chooses. Early verdict ends chat immediately. Model responses are stochastic, and network latency is not guaranteed to reproduce any particular game.

## Boundaries and persistence

Messages retain the app's 500-grapheme / 2,000-byte limit and 30 human messages per participant. Invite, opening and verdict actions retain 90-second timeouts. The input stays mounted and editable when sending is blocked; both Send and Enter submission respect the phase. Instructions and status remain separate from the stable composer placeholder.

Explicit leave abandons. Disconnection/refresh retains the authenticated seat while deadlines continue. Provider credential/capacity failures are technical failures, not losses. Persist only match IDs and outcomes for aggregate scoring, without provider usage accounting. Messages, submitted openings, names and judge reasoning remain in memory for the current match. No saved-game browsing or public match access is available. Do not persist unsent drafts or raw model request bodies.

## AI usage

AI requests have no application spending budgets, token accounting, per-network match quotas or automatic admission pauses. Normal request timeouts, reply length settings, game deadlines and cancellation remain. Provider errors fail the affected game without pausing future matches.

Bun owns the game, React/Tailwind owns the UI, PostgreSQL/PGlite owns storage, and a TypeScript worker runs the conversation engine. OpenRouter is the sole inference route. Fly production deployment is configured in docs/deployment.md. Keep dependencies project-local and create conventional commits at completed milestones.

## Homepage credits and live score

The homepage credits Marc and Nik with links to their X profiles. A live line reports how many completed games the AI fooled the judge in, alongside total completed games. This counts match outcomes, not unique people. Failed, abandoned and unfinished matches do not count. Existing lobby broadcasts refresh the database aggregate when verdicts are saved and on the regular server tick; no player details are exposed.

## Play again

Results offer Play again with the current role or Change role (human, judge or either) before public matchmaking. Friend games offer a rematch with the same opponent without a new link, starting only after both participants opt in with compatible roles. Either role accepts the opposite seat; two flexible choices are assigned randomly. Matching fixed preferences require one person to change. Offers can be canceled and are withdrawn when a participant leaves or disconnects. If the friend is no longer on the result screen, Invite again creates a new invitation. The entered name is reused when replaying, and each new round receives fresh identities and messages.
