import type { ComponentProps } from 'react';

export function Banner({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={`mt-5 flex justify-between gap-5 rounded-none border border-[#f17b49] bg-[#351c17] p-4 text-[15px] leading-[1.6] text-[#ffcfaf] [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-inherit [&_button]:underline ${className}`}
      {...props}
    />
  );
}
