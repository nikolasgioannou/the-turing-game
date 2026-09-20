import type { ComponentProps } from 'react';

const variants = {
  primary:
    'border-2 border-[#ffa565] bg-[#ff6b2c] font-black text-[#100e0c] shadow-[inset_0_-4px_0_#c4451b,0_4px_0_#532516] enabled:hover:-translate-y-px enabled:hover:bg-[#ff904d] enabled:hover:brightness-100 enabled:active:translate-y-0.5 enabled:active:shadow-[inset_0_-2px_0_#c4451b]',
  secondary: 'border border-[#52656d] bg-[#172126] font-bold text-ink',
  ghost: 'border-0 bg-transparent text-[#92b5c0] underline-offset-5 hover:underline',
  arcade:
    'w-auto min-w-75 border-2 border-[#ff8b46] bg-[#15110d] font-arcade text-[#ff8b46] uppercase shadow-[inset_0_0_0_3px_#69341b,0_0_16px_#ff682e26] before:mr-4.5 before:text-[15px] before:content-["▶"] enabled:hover:bg-accent enabled:hover:text-canvas max-[640px]:w-full max-[640px]:min-w-0',
};
const sizes = {
  default: 'min-h-11 px-4.5 py-3 text-sm leading-[1.4]',
  compact: 'min-h-11 px-4 py-2.5 text-[13px] leading-[1.4]',
  composer:
    'min-h-12 px-3.75 py-2.5 text-sm leading-[1.4] max-[600px]:max-w-33 max-[600px]:text-xs',
  arcade: 'min-h-15 px-4.5 py-2.75 text-base leading-[1.4] max-[640px]:text-[13px]',
  text: 'min-h-11 px-0 py-1 text-sm leading-normal',
};

type StyleProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
};

function buttonStyles({ variant = 'primary', size = 'default', className = '' }: StyleProps = {}) {
  return `button rounded-none focus-visible:outline-2 focus-visible:outline-player-b focus-visible:outline-offset-5 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`;
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & StyleProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}

export function SegmentButton({
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={`min-h-11 flex-1 border-0 bg-transparent p-2.25 text-[13px] font-bold text-[#adb9bb] aria-pressed:bg-accent aria-pressed:text-[#100d08] ${className}`}
      {...props}
    />
  );
}
