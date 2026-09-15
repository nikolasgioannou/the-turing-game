import { useId, type ComponentProps } from 'react';

function HumanFace() {
  return (
    <>
      <path fill="currentColor" d="M5 1h6v1h2v7h-2v2H5V9H3V2h2zM5 12h6v1h3v3H2v-3h3z" />
      <path fill="var(--color-canvas)" d="M5 5h2v2H5zm4 0h2v2H9zM6 9h4v1H6z" />
    </>
  );
}

function JudgeFace() {
  return (
    <>
      <path
        fill="currentColor"
        d="M4 0h8v1h2v2h1v7h-3V4H4v6H1V3h1V1h2zM4 4h8v5h-1v2H5V9H4zM5 12h6v1h3v3H2v-3h3z"
      />
      <path
        fill="var(--color-canvas)"
        d="M5 5h2v2H5zm4 0h2v2H9zM6 9h4v1H6zM5 12h6l-3 3zM1 4h2v1H1zm12 0h2v1h-2zM1 7h2v1H1zm12 0h2v1h-2z"
      />
    </>
  );
}

export function IdentityIcon({
  kind,
  className = '',
  ...props
}: ComponentProps<'svg'> & { kind: 'human' | 'bot' | 'judge' | 'either' }) {
  const id = useId();

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={`size-5 shrink-0 ${className}`}
      {...props}
    >
      {kind === 'bot' ? (
        <>
          <path
            fill="currentColor"
            d="M6 0h4v2H9v2h5v9H2V4h5V2H6zM0 6h1v5H0zm15 0h1v5h-1zM5 14h6v2H5z"
          />
          <path fill="var(--color-canvas)" d="M4 6h3v2H4zm5 0h3v2H9zM4 10h8v2H4z" />
          <path fill="currentColor" d="M6 10h1v2H6zm3 0h1v2H9z" />
        </>
      ) : kind === 'either' ? (
        <>
          <defs>
            <clipPath id={`${id}-human`}>
              <path d="M0 0h8v16H0z" />
            </clipPath>
            <clipPath id={`${id}-judge`}>
              <path d="M8 0h8v16H8z" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-human)`} className="text-player-a">
            <HumanFace />
          </g>
          <g clipPath={`url(#${id}-judge)`} className="text-player-b">
            <JudgeFace />
          </g>
        </>
      ) : kind === 'judge' ? (
        <JudgeFace />
      ) : (
        <HumanFace />
      )}
    </svg>
  );
}
