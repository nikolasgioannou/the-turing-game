import type { ComponentProps, ReactNode } from 'react';

export function ChoiceButton({
  compact = false,
  tone = 'a',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { compact?: boolean; tone?: 'a' | 'b' }) {
  return (
    <button
      type={type}
      className={`choice min-h-11 min-w-16.25 border-2 bg-[#151a1c] text-[15px] aria-pressed:border-ink aria-pressed:bg-[#24363d] aria-pressed:text-[#fff0d6] aria-pressed:shadow-[inset_0_0_0_1px_var(--color-ink)] ${tone === 'a' ? 'border-[#805034] text-[#ffad76]' : 'border-[#367586] text-[#75dcfc]'} ${compact ? 'px-3.5 py-2' : 'px-4.5 py-3'} ${className}`}
      {...props}
    />
  );
}

export function RoleButton({
  tone,
  title,
  children,
  ...props
}: ComponentProps<'button'> & { tone: 'a' | 'b'; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`border bg-[#17191a] p-4.5 text-left hover:border-current hover:bg-[#242a2c] ${tone === 'a' ? 'border-[#8c492e] text-[#ff985c] shadow-[3px_3px_0_#3b271b]' : 'border-[#327d91] text-[#66d9fc] shadow-[3px_3px_0_#183e47]'}`}
      {...props}
    >
      <strong className="block font-arcade text-xs leading-[1.6] font-medium max-[640px]:text-[11px]">
        {title}
      </strong>
      <span className="mt-1.25 block text-[13px] leading-normal text-[#b3bbb9]">{children}</span>
    </button>
  );
}
