import { useEffect, useState } from 'react';
import type { Lobby } from '../shared/protocol';

export function LiveScore({ score, connected }: { score?: Lobby['score']; connected: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (motion.matches) {
      setStep(20);

      return;
    }

    setStep(0);

    let frame = 0;
    const timer = window.setInterval(() => {
      frame++;
      setStep(score ? Math.min(frame, 20) : frame % 20);

      if (score && frame >= 20) window.clearInterval(timer);
    }, 45);

    return () => window.clearInterval(timer);
  }, [score?.completed, score?.aiWins]);

  const rate = score?.completed ? Math.round((score.aiWins / score.completed) * 100) : null;
  const displayedRate = rate === null ? null : Math.round(rate * (step / 20));
  const filled = displayedRate === null ? 0 : Math.round(displayedRate / 5);

  return (
    <section
      className="mx-auto mt-6 w-full max-w-100 border border-line bg-canvas/60 px-5 py-4 text-left shadow-[3px_3px_0_#18282e] max-[640px]:px-3.5"
      aria-label="Live game score"
      aria-busy={!score}
    >
      <div className="flex items-center justify-between gap-3 text-[9px] tracking-[0.18em] uppercase">
        <span className="text-muted">Human vs machine</span>
        <span className="flex items-center gap-2 text-player-b">
          <span
            className={`h-1.5 w-1.5 ${connected ? 'bg-player-b shadow-[0_0_8px_#4bd3ff80]' : 'bg-muted'}`}
            aria-hidden="true"
          />
          {!score ? 'Loading results' : connected ? 'Live results' : 'Last score'}
        </span>
      </div>
      <div
        className="mt-4 flex items-center gap-5 max-[640px]:gap-3.5"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sr-only">
          {rate === null ? 'No percentage yet.' : `${rate}% of judges fooled.`}
        </span>
        <strong
          aria-hidden="true"
          className="w-[4ch] shrink-0 font-arcade text-[30px] leading-tight text-accent tabular-nums [text-shadow:2px_2px_0_#713119] max-[640px]:text-[24px]"
        >
          {displayedRate === null ? '—' : `${displayedRate}%`}
        </strong>
        <div className="min-w-0 text-xs leading-5">
          <span className="block font-bold text-ink">Judges fooled</span>
          <span className="block min-h-10 text-muted">
            {!score
              ? 'Loading results…'
              : score.completed
                ? `${score.aiWins.toLocaleString()} of ${score.completed.toLocaleString()} games`
                : 'No completed games yet.'}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-20 gap-1" aria-hidden="true">
        {Array.from({ length: 20 }, (_, index) => (
          <span
            key={index}
            className={`h-2 ${step < 20 && index === step ? 'bg-player-b shadow-[2px_-2px_0_#f8ebc8]' : index < filled ? 'bg-accent shadow-[0_0_5px_#ff682e30]' : 'bg-line/60'}`}
          />
        ))}
      </div>
    </section>
  );
}

export function CreatorCredits() {
  const linkStyle =
    'text-ink underline decoration-muted/50 underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-player-b';

  return (
    <p className="mt-6 text-center text-xs leading-6 text-muted">
      Created by{' '}
      <a
        className={linkStyle}
        href="https://x.com/marcbaghadjian"
        target="_blank"
        rel="noopener noreferrer"
      >
        Marc
      </a>{' '}
      &amp;{' '}
      <a
        className={linkStyle}
        href="https://x.com/NikolasIoannou_"
        target="_blank"
        rel="noopener noreferrer"
      >
        Nik
      </a>
    </p>
  );
}
