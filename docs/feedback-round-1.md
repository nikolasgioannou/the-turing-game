# Feedback round 1 → low-effort-v16

32 user-rated pairs: 15 both bad, 5 both good, 12 directional preferences. Current v15 won 7
directional choices; the shorter voice-first experiment won 5. This small batch does not establish a
clear winner. Across 64 old outputs the median length was 8.5 words, with several long outliers and
one explicit reasoning leak.

The repeated feedback favors minimal direct answers, no unnecessary biography or witty second
clause, no performance of being human, fewer manufactured typos, and independent knowledge/identity.
Sample tone is a guide, not a mandate to reproduce every opinion or sentence shape. The user
sometimes preferred a copied answer; that is not adopted as a rule because hidden-answer/identity
separation remains a game invariant. User rewrites were treated as evaluation feedback, never
inserted as stock system-prompt answers.

Changes: short plain replies with an answer-and-stop objective; no lists of human quirks as
evidence; less rigid sample imitation; explicit clarification for unnamed events; explicit addressee
routing from the known internal A/B mapping; observable casing applied to AI output only, without
changing player messages or manufacturing typos. Local live generation now disables thinking and
uses a 128-token output ceiling within the existing 512-token reservation. Reject length-truncated
replies and recognizable analysis headings including the exact untagged leak from the export. No
extra generation/critic calls and no training.

Measured local checks: 14 regression openings produced 1–5 words (median 2) in the final regression
run. This measures brevity, not human quality. New development checks exposed two failures (unnamed
festival and question directed at the opponent); after revision those returned a clarification and
[WAIT]. Own-name continuity returned the established assistant name. Remaining concern: some replies
are generic or flat (including uncertainty on the teasing love question); only new user ratings can
establish improvement.

Round two has 8 regression scenarios and 8 reserved new user-check scenarios, not used in
development probes. It compares the complete v16 revision against a frozen v15 message builder and
inference settings. Comparison batches are isolated without deleting earlier ratings; exports retain
all rounds plus exact prompts, outputs, model, token usage and (new calls) sampling settings/seed.
No automatic model or prompt training. No claim that the old check set remains unseen: it was
consumed by the supplied feedback.
