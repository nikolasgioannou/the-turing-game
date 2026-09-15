import type { ComponentProps } from 'react';

const fieldStyles =
  'rounded-none border border-[#73654e] bg-[#080e11] text-ink shadow-none focus-visible:border-player-b focus-visible:outline focus-visible:outline-player-b focus-visible:outline-offset-0';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${fieldStyles} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`overscroll-none ${fieldStyles} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={`${fieldStyles} cursor-pointer px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
