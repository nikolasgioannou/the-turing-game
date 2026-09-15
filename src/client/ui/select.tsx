import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string; label: string; disabled?: boolean };

export function Select({
  value,
  options,
  onValueChange,
  disabled = false,
  className = '',
  'aria-label': label,
}: {
  value: string;
  options: readonly Option[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-label': string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const expand = () => {
    if (disabled || !enabled.length) return;

    setActive(selected >= 0 && !options[selected].disabled ? selected : enabled[0]);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];

    if (!option || option.disabled) return;

    onValueChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;

    const menu = list.current!;
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const up = below < Math.min(240, options.length * 40 + 8) && above > below;
      const height = Math.max(40, Math.min(280, up ? above : below));

      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16);

      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${height}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      menu.style.top = up ? 'auto' : `${rect.bottom + 6}px`;
      menu.style.bottom = up ? `${window.innerHeight - rect.top + 6}px` : 'auto';
    };

    position();
    menu.showPopover();

    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.contains(event.target as Node))
        setOpen(false);
    };

    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside, true);

    return () => {
      if (menu.matches(':popover-open')) menu.hidePopover();

      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);

      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }

      return;
    }

    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();

      if (!open) {
        expand();

        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        choose(active);

        return;
      }

      const current = enabled.indexOf(active);

      setActive(
        event.key === 'Home'
          ? enabled[0]
          : event.key === 'End'
            ? enabled.at(-1)!
            : enabled[
                (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
              ],
      );
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();

      const now = Date.now();

      search.current = {
        text:
          (now - search.current.time > 700 ? '' : search.current.text) + event.key.toLowerCase(),
        time: now,
      };

      const match = enabled.find((index) =>
        options[index].label.toLowerCase().startsWith(search.current.text),
      );

      if (!open) expand();

      if (match !== undefined) setActive(match);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled || !enabled.length}
        onClick={() => (open ? setOpen(false) : expand())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center justify-between gap-5 rounded-none border border-[#73654e] bg-[#080e11] px-3 py-2 text-left text-xs text-ink focus-visible:border-player-b focus-visible:outline-2 focus-visible:outline-player-b disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span>{options[selected]?.label ?? 'Choose…'}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className={`size-3 shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none"
        >
          <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={list}
              id={id}
              role="listbox"
              aria-label={label}
              popover="manual"
              className="fixed m-0 overflow-y-auto overscroll-contain rounded-none border border-player-b bg-[#101619] p-1 text-ink shadow-[4px_4px_0_#18282e]"
              onMouseDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <div
                  id={`${id}-${index}`}
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  onPointerMove={() => {
                    if (!option.disabled) setActive(index);
                  }}
                  onClick={() => choose(index)}
                  className={`flex min-h-10 cursor-pointer items-center justify-between gap-4 px-3 py-2 text-xs ${option.disabled ? 'cursor-not-allowed opacity-40' : index === active ? 'bg-[#20343c] text-player-b' : 'text-ink'}`}
                >
                  {option.label}
                  <span aria-hidden="true" className="w-3 shrink-0 font-arcade">
                    {option.value === value ? '✓' : ''}
                  </span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
