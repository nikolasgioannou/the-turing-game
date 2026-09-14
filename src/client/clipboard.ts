// HTTP LAN games lack the secure-context clipboard API.
export async function copyText(text: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);

      return;
    }
  } catch {
    /* Try the user-gesture copy path when permission is denied. */
  }

  const focus = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');

  field.value = text;
  field.setAttribute('aria-label', 'Copy link');
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  // Keep the temporary selection inside a modal's focus boundary when one is open.
  (document.querySelector('dialog[open]') ?? document.body).append(field);

  try {
    field.select();

    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    field.remove();
    focus?.focus({ preventScroll: true });
  }
}
