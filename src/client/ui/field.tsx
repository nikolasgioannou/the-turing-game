import type { ComponentProps } from 'react';

const fieldStyles =
  'max-[640px]:text-base rounded-none border border-[#73654e] bg-[#080e11] text-ink shadow-none focus-visible:border-player-b focus-visible:outline focus-visible:outline-player-b focus-visible:outline-offset-0';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${fieldStyles} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`overscroll-none ${fieldStyles} ${className}`} {...props} />;
}
