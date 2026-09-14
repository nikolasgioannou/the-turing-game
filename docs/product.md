# Product

Two humans participate: a contestant competing with AI and a judge trying to identify the AI. The
judge choosing the AI means the human wins; choosing the human means the AI wins. Historical
human-guess matches retain their original scoring and replay explanation.

The lobby supports matchmaking or an invited opponent. Anonymous A/B assignments remain fixed.
Public spectator views and replays exclude identity mapping until the verdict; invite tokens reserve
seats and do not grant access to private context. A judge may guess early during live chat. Verdict
and optional reasoning commit together before the reveal.

## Conversation

The AI runs Claude Haiku 4.5 through OpenRouter. Its conversation engine handles prompting, style
analysis, draft observation, randomized planning, hedges, retries, message shaping, accusations,
occasional nudges and delivery pacing. See `src/server/bot/README.md`.

The human's first submitted answer is held until the AI's first message. The bot can also send first
from a developed draft or start after 40 seconds without human typing. Its first reply starts the
90-second free chat. Both humans can then post freely. The bot sees the human's live draft through
OpenRouter, including during opening. Drafts/style cards are not persisted or exposed to other
browsers. The bot receives browser clock/device hints; no training or cross-match learning occurs.

At chat expiry, pending bot work is canceled and the judge chooses. Early verdict ends chat
immediately. Model responses are stochastic, and network latency is not guaranteed to reproduce any
particular game.

## Boundaries and persistence

Messages retain the app's 500-grapheme / 2,000-byte limit and 30 human messages per participant.
Invite, opening and verdict actions retain 90-second timeouts. The input stays mounted and editable
when sending is blocked; both Send and Enter submission respect the phase. Instructions and status
remain separate from the stable composer placeholder.

Explicit leave abandons. Disconnection/refresh retains the authenticated seat while deadlines
continue. Provider credential/capacity failures are technical failures, not losses. Persist public
messages, submitted openings, verdict/reasoning, model/prompt version and provider usage metadata.
Do not persist unsent drafts or raw model request bodies.

## Capacity

Reserve initial match capacity before admission. Each real API attempt, including hedges, retries
and style analysis, is separately charged. Dynamically top up under the existing daily token caps;
release unused capacity at closure. No legacy ten-request cap controls bot behavior. Missing usage
remains conservatively charged. Views/replays remain available when generation capacity is spent.

Bun owns the game, React/Tailwind owns the UI, PostgreSQL/PGlite owns storage, and a
standard-library Python worker runs the conversation engine. OpenRouter is the sole inference route.
Fly deployment is still paused pending owner details. Keep dependencies project-local and create
conventional commits at completed milestones.

## Homepage credits and live score

The homepage credits Marc and Nik with links to their X profiles. A live line reports how many
completed games the AI fooled the judge in, alongside total completed games. This counts match
outcomes, not unique people. Failed, abandoned and unfinished matches do not count. Legacy matches
retain their original scoring direction. Existing lobby broadcasts refresh the database aggregate
when verdicts are saved and on the regular server tick; no player details are exposed.
