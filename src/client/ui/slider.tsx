import type { ComponentProps } from 'react';

// Keep native range semantics, keyboard controls and React 19 ref forwarding.
export function Slider({ className = '', ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      {...props}
      type="range"
      className={`h-11 min-w-0 cursor-pointer appearance-none rounded-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-player-b disabled:cursor-not-allowed disabled:opacity-40 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-player-b [&::-moz-range-thumb]:shadow-[2px_2px_0_var(--color-canvas)] [&::-moz-range-track]:h-1 [&::-moz-range-track]:border [&::-moz-range-track]:border-muted/50 [&::-moz-range-track]:bg-canvas [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:border [&::-webkit-slider-runnable-track]:border-muted/50 [&::-webkit-slider-runnable-track]:bg-canvas [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-player-b [&::-webkit-slider-thumb]:shadow-[2px_2px_0_var(--color-canvas)] ${className}`}
    />
  );
}
