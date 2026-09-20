import type { ComponentProps } from 'react';

export function Banner({
  className = '',
  tone = 'warning',
  ...props
}: ComponentProps<'div'> & { tone?: 'warning' | 'info' }) {
  return (
    <div
      className={`mt-5 flex justify-between gap-5 rounded-none border p-4 text-[15px] leading-[1.6] [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:shrink-0 [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-inherit [&_button]:underline ${tone === 'info' ? 'border-player-b bg-[#142d36] text-player-b' : 'border-[#f17b49] bg-[#351c17] text-[#ffcfaf]'} ${className}`}
      {...props}
    />
  );
}
