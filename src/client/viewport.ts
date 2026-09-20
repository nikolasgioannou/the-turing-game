import { useEffect } from 'react';

export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        // Keep normal browser zoom/panning accessible instead of resizing around it.
        if (viewport && viewport.scale !== 1) return;

        root.style.setProperty('--visual-height', `${viewport?.height ?? window.innerHeight}px`);
        root.style.setProperty('--visual-top', `${viewport?.offsetTop ?? 0}px`);

        const focused = document.activeElement;

        if (focused instanceof HTMLElement) {
          const panel = focused.closest<HTMLElement>('.action-panel, dialog');

          if (panel) {
            const field = focused.getBoundingClientRect();
            const bounds = panel.getBoundingClientRect();

            if (field.bottom > bounds.bottom - 12)
              panel.scrollTop += field.bottom - bounds.bottom + 12;
            else if (field.top < bounds.top + 12) panel.scrollTop -= bounds.top + 12 - field.top;
          }
        }
      });
    };

    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--visual-height');
      root.style.removeProperty('--visual-top');
    };
  }, []);
}
