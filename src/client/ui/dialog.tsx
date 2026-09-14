import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;

    dialog.showModal();

    return () => {
      dialog.close();

      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="start-dialog m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto overscroll-none rounded-none border-2 border-accent bg-[#101619] p-0 text-ink shadow-[6px_6px_0_#582c1e,0_20px_80px_#000b] backdrop:bg-[#02080de0] backdrop:backdrop-blur-[3px]"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content relative p-7 max-[640px]:p-5 [&_h2]:mt-2.5 [&_h2]:mb-6 [&_h2]:font-arcade [&_h2]:text-lg [&_h2]:leading-[1.6] [&_h2]:font-[750] [&_h2]:text-ink max-[640px]:[&_h2]:text-base [&>.eyebrow]:text-[#ff8b46] [&>p]:my-4 [&>p]:text-[13px]">
        <button
          type="button"
          className="absolute top-2.5 right-2.5 size-9.5 border-0 bg-transparent text-[26px] text-[#9eaeb2]"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
        {children}
      </div>
    </dialog>
  );
}
