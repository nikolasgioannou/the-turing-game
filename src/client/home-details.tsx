import type { Lobby } from '../shared/protocol';

export function LiveScore({ score, connected }: { score: Lobby['score']; connected: boolean }) {
  return (
    <p
      className="mt-5 text-center text-xs leading-6 text-muted max-[640px]:px-2"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="mr-2 text-[10px] tracking-widest text-player-b uppercase">
        {connected ? 'Live' : 'Last score'}
      </span>
      {score.completed ? (
        <>
          AI fooled the judge in{' '}
          <strong className="font-bold text-ink">{score.aiWins.toLocaleString()}</strong> of{' '}
          {score.completed.toLocaleString()} games.
        </>
      ) : (
        'No completed games yet.'
      )}
    </p>
  );
}

export function CreatorCredits() {
  const linkStyle =
    'text-ink underline decoration-muted/50 underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-player-b';

  return (
    <p className="mt-2 text-center text-xs leading-6 text-muted">
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
