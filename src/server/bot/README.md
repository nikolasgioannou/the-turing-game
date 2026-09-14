# Reference bot

Behavior source: [mbaghadjian/turing-game](https://github.com/mbaghadjian/turing-game), `server.py`
at **3c09d6b9515c57837863617f874952ee2f173e7d**.

The original Python brain is retained to preserve its prompts, random distributions, timing,
regexes, similarity calculations, style analysis, normalization, retries and multi-bubble delivery.
`reference.py` contains all 49 original non-transport methods and class constants. `system.txt` is
an exact copy of SYSTEM for recording the prompt version in match metadata. The manifest hashes
Python ASTs against the pinned source, ignoring formatting. Tests verify every retained member and
the exact system prompt. Do not casually edit this file or regenerate the manifest to hide drift.

## Integration changes

- The source uses Anthropic directly with `claude-haiku-4-5`. The adapter uses OpenRouter's
  `anthropic/claude-haiku-4.5`, routed to Anthropic with provider fallbacks disabled. No temperature
  override; thinking is disabled. Chat calls retain 400 output tokens and style analysis 500.
- Original API client behavior: six-second request timeout, one transient retry, 20-second style
  timeout, and a second hedged chat call after 2.5 seconds. Each actual call is accounted
  separately.
- The application mock branch is removed from `generate`; the mock guard is removed from
  `analyze_style`. The unused socket annotation in `__init__` no longer needs FastAPI's WebSocket.
  The other 46 methods are unchanged, including original fallback replies after empty generation.
- FastAPI, matchmaking, original disk storage, snapshots and vote handling are not copied. Bun owns
  sessions, identity secrecy, public views, persistence, admission limits and correct AI-guess
  scoring. Its phase adapter accepts both paired reveal and the reference's early opening attack.
- `worker.py` supplies `broadcast` over private JSON lines. `transport.py` presents the response
  shape expected by the original brain. Credentials and HTTPS requests remain in Bun. Python uses
  only its standard library; it runs no local inference and needs no model dependencies.
- Drafts use the source client's 120 ms debounce, including opening drafts. Browser timezone,
  weekday, time and device hints use the same fields. Our anonymous UI supplies no pre-game names;
  the source accepts empty names too. No additional system prompt or calendar instruction is added.
- Drafts and style cards remain transient in the worker and are sent to OpenRouter. They are not
  written to application traces, database snapshots or public views. Original verbose logs are
  suppressed because they include private text.
- Existing message-size, human-action timeout and daily-token limits remain application boundaries.
  Budget exhaustion/credential failure ends a match as a technical failure. Transient generation
  failure retains the reference's behavior. Closing chat kills the worker and cancels pending HTTP
  calls, preventing late delivery. Socket refresh does not restart the bot.

OpenRouter routing and network latency are necessarily different from direct Anthropic; identical
stochastic outputs and latency cannot be guaranteed. The bot's decision code is preserved.

Run `bun test` for source parity, deterministic brain checks, the actual Python worker with a
controlled HTTP transport, and game/store/HTTP adapter tests. `bun run test:e2e` requires a real
OpenRouter key and makes paid model calls.
