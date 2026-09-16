import type { Ref } from 'react';
import type { Lobby } from '../shared/protocol';
import { Banner } from './ui';

export type AvailabilityNoticeState = {
  unavailable: boolean;
  queued: boolean;
  paused: boolean;
  recovered: boolean;
};

export const initialAvailabilityNotice: AvailabilityNoticeState = {
  unavailable: false,
  queued: false,
  paused: false,
  recovered: false,
};

export function availabilityNoticeReducer(
  state: AvailabilityNoticeState,
  action: { type: 'lobby'; lobby: Lobby } | { type: 'dismiss' },
): AvailabilityNoticeState {
  if (action.type === 'dismiss') return { ...state, recovered: false, paused: false };

  const unavailable = !action.lobby.availability.available;

  return {
    unavailable,
    queued: !!action.lobby.queued,
    paused: unavailable && (state.paused || state.queued || !!action.lobby.queued),
    recovered: !unavailable && (state.unavailable || state.recovered),
  };
}

export function AvailabilityNotice({
  availability,
  state,
  bannerRef,
  onPlay,
  actionLabel = 'Play again',
  onDismiss,
}: {
  availability: Lobby['availability'] | undefined;
  state: AvailabilityNoticeState;
  bannerRef: Ref<HTMLDivElement>;
  onPlay?: () => void;
  actionLabel?: string;
  onDismiss: () => void;
}) {
  if (availability && !availability.available) {
    const reset = availability.resetsAt;

    return (
      <Banner ref={bannerRef} role="status" className="availability">
        <div>
          {state.paused ? <strong className="mb-1 block">Matchmaking paused</strong> : null}
          <p>{availability.message}</p>
          <p className="mt-2 text-xs text-ink">
            {reset && reset > Date.now() ? (
              <>
                More games may be available after{' '}
                <time dateTime={new Date(reset).toISOString()}>
                  {new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  }).format(reset)}
                </time>
                .{' '}
              </>
            ) : null}
            We’ll check automatically.
          </p>
        </div>
      </Banner>
    );
  }

  if (!state.recovered) return null;

  return (
    <Banner tone="info" role="status" className="flex-wrap items-center">
      <div>
        <strong className="block">Games are back!</strong>
        <p className="mt-1 text-sm text-ink">Ready for another round?</p>
      </div>
      <div className="flex items-center gap-5">
        {onPlay ? (
          <button type="button" className="min-h-11 font-bold" onClick={onPlay}>
            {actionLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="min-h-11"
          onClick={onDismiss}
          aria-label="Dismiss availability notification"
        >
          Dismiss
        </button>
      </div>
    </Banner>
  );
}
