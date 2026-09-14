import type { ComponentProps } from 'react';

export function AppShell({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={`app-shell mx-auto max-w-260 px-8 has-[.active-chat]:flex has-[.active-chat]:h-dvh has-[.active-chat]:max-w-240 has-[.active-chat]:flex-col has-[.active-chat]:px-6 has-[.arcade-lobby]:flex has-[.arcade-lobby]:min-h-dvh has-[.arcade-lobby]:flex-col max-[700px]:px-5.5 max-[640px]:px-3.5 max-[600px]:has-[.active-chat]:px-3.5 ${className}`}
      {...props}
    />
  );
}

export function RoomTitle({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={`room-title my-9.5 flex items-center justify-between gap-5 border-2 border-accent bg-[#0c1317] p-5 group-[.active-chat]/room:mt-4 group-[.active-chat]/room:mb-3 group-[.active-chat]/room:shrink-0 group-[.active-chat]/room:py-4 max-[700px]:my-7.5 max-[640px]:group-[.active-chat]/room:gap-2 max-[640px]:group-[.active-chat]/room:p-3 max-[600px]:group-[.active-chat]/room:mt-3 max-[600px]:group-[.active-chat]/room:mb-2 [&_.eyebrow]:mb-3 group-[.active-chat]/room:[&_.eyebrow]:mb-1.5 group-[.active-chat]/room:[&_.eyebrow]:text-[10px] max-[640px]:group-[.active-chat]/room:[&_.eyebrow]:text-[9px] [&_h1]:m-0 [&_h1]:font-arcade [&_h1]:text-[clamp(18px,3vw,28px)] [&_h1]:leading-normal [&_h1]:font-medium [&_h1]:tracking-[-1px] [&_h1]:text-ink [&_h1]:uppercase group-[.active-chat]/room:[&_h1]:text-[19px] group-[.active-chat]/room:[&_h1]:tracking-[-0.02em] max-[640px]:group-[.active-chat]/room:[&_h1]:text-[13px] max-[640px]:group-[.active-chat]/room:[&_h1]:tracking-[-0.5px] ${className}`}
      {...props}
    />
  );
}

export function RoomToolbar({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={`room-topline mb-2.5 flex items-center justify-between gap-3.75 text-[11px] group-[.active-chat]/room:shrink-0 group-[.active-chat]/room:gap-3 group-[.active-chat]/room:text-xs max-[700px]:flex-wrap [&_.eyebrow]:m-0 max-[700px]:[&_.eyebrow]:text-[10px] max-[600px]:group-[.active-chat]/room:[&_.eyebrow]:hidden ${className}`}
      {...props}
    />
  );
}
