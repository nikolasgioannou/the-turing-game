import type { ComponentProps } from 'react';

export function IdentityIcon({
  kind,
  className = '',
  ...props
}: ComponentProps<'svg'> & { kind: 'human' | 'bot' }) {
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
            d="M7 0h2v3h4v2h2v7h-2v2H3v-2H1V5h2V3h4zM0 7h1v4H0zm15 0h1v4h-1z"
          />
          <path fill="var(--color-canvas)" d="M4 6h3v3H4zm5 0h3v3H9zm-4 5h6v1H5z" />
        </>
      ) : (
        <>
          <path fill="currentColor" d="M5 1h6v1h2v7h-2v2H5V9H3V2h2zM5 12h6v1h3v3H2v-3h3z" />
          <path fill="var(--color-canvas)" d="M5 5h2v2H5zm4 0h2v2H9zM6 9h4v1H6z" />
        </>
      )}
    </svg>
  );
}
