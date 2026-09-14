import { useEffect, useRef, useState } from 'react';

export function Music() {
  const audio = useRef<HTMLAudioElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('tg_vol') ?? '0.35');

      return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.35;
    } catch {
      return 0.35;
    }
  });

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;

    try {
      localStorage.setItem('tg_vol', String(volume));
    } catch {
      /* Storage can be unavailable. */
    }
  }, [volume]);

  useEffect(() => {
    const start = (event: Event) => {
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);

      if (event.target instanceof Node && controls.current?.contains(event.target)) return;

      void audio.current?.play().catch(() => {});
    };

    document.addEventListener('pointerdown', start);
    document.addEventListener('keydown', start);

    return () => {
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
    };
  }, []);

  return (
    <div
      ref={controls}
      className="flex shrink-0 items-center justify-end gap-3 py-2 text-xs text-muted"
      aria-label="Background music"
    >
      <audio
        ref={audio}
        src="/music.mp3"
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      />
      <button
        type="button"
        aria-label={playing ? 'Pause music' : 'Play music'}
        aria-pressed={playing}
        className="min-h-9 px-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-player-b"
        onClick={() => {
          const player = audio.current;

          if (!player) return;

          if (player.paused) void player.play().catch(() => {});
          else player.pause();
        }}
      >
        {playing ? '♫ Pause' : '♪ Music'}
      </button>
      <input
        type="range"
        aria-label="Music volume"
        min="0"
        max="1"
        step="0.02"
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="h-9 w-20 accent-player-b"
      />
    </div>
  );
}
