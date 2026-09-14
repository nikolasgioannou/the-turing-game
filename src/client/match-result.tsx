import type { RoomView } from '../shared/protocol';
import { IdentityIcon } from './ui/identity-icon';

export function MatchResult({
  result,
  role,
}: {
  result: NonNullable<RoomView['result']>;
  role: RoomView['role'];
}) {
  const won = result.humanWon;
  const isJudge = role === 'judge';
  const explanation = isJudge
    ? won
      ? 'You correctly identified the bot.'
      : 'You mistook the human for the bot.'
    : won
      ? 'The judge identified the bot. You proved you were human.'
      : 'The judge mistook you for the bot.';

  return (
    <section aria-label="Your result" className="mb-8 border border-line bg-panel p-6 sm:p-8">
      <p className="mb-3 text-xs tracking-widest text-muted uppercase">Game over</p>
      <h1
        className={`mb-4 font-arcade text-[clamp(24px,5vw,42px)] leading-tight ${won ? 'text-player-b' : 'text-player-a'}`}
      >
        {won ? 'You won!' : 'You lost.'}
      </h1>
      <p className="max-w-lg text-base leading-relaxed text-ink">{explanation}</p>
      <div className="mt-7 grid grid-cols-2 gap-3" aria-label="Identities revealed">
        {(['A', 'B'] as const).map((label) => {
          const human = label === result.humanLabel;
          const selected = label === result.choice;

          return (
            <div
              key={label}
              className={`flex flex-col items-start gap-3 border p-4 ${selected ? 'border-muted bg-white/5' : 'border-transparent'}`}
            >
              <IdentityIcon
                kind={human ? 'human' : 'bot'}
                className={`size-9 ${label === 'A' ? 'text-player-a' : 'text-player-b'}`}
              />
              <div>
                <p className="font-bold text-ink">{human ? (isJudge ? 'Human' : 'You') : 'Bot'}</p>
                <p className="mt-1 text-xs text-muted">Was contestant {label}</p>
              </div>
              {selected ? (
                <span className="text-xs text-ink">{isJudge ? 'Your pick' : 'Judge’s pick'}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {result.reason ? (
        <blockquote className="mt-6 border-l-2 border-line pl-4 text-sm leading-relaxed break-words whitespace-pre-wrap text-muted">
          “{result.reason}”
          <cite className="mt-2 block text-xs not-italic">
            {isJudge ? 'Your reasoning' : 'The judge’s reasoning'}
          </cite>
        </blockquote>
      ) : null}
    </section>
  );
}
