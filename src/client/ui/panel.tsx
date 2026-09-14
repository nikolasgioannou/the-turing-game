import type { ComponentProps } from 'react';

const tones = { accent: 'border-accent bg-[#10171b]', neutral: 'border-line bg-panel' };

export function Panel({
  tone = 'accent',
  className = '',
  ...props
}: ComponentProps<'section'> & { tone?: keyof typeof tones }) {
  return <section className={`rounded-none border p-6 ${tones[tone]} ${className}`} {...props} />;
}
