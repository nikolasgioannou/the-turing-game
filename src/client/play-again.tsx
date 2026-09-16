import { useState } from 'react';
import type { Command, QueuePreference, RoomView } from '../shared/protocol';
import { Banner, Button, Dialog, RoleButton } from './ui';

export function PlayAgain({
  available,
  room,
  connected,
  send,
  play,
  home,
}: {
  available: boolean;
  room: RoomView;
  connected: boolean;
  send: (command: Command) => void;
  play: (role: QueuePreference, invite: boolean) => void;
  home: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const friend = room.matchKind === 'friend';
  const rematch = room.rematch;
  const canRematch = friend && rematch?.available;
  const choose = (role: QueuePreference) => {
    if (!connected || !available) return;

    setChoosing(false);

    if (canRematch) send({ type: 'rematch', role });
    else play(role, friend);
  };

  return (
    <section className="mt-7 mb-8 space-y-4" aria-label="Play again">
      {friend && !canRematch ? (
        <p className="text-sm text-muted" role="status">
          Your friend has left. Send a new invitation to play again.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!connected || !available || (!!rematch?.own && !!canRematch)}
          onClick={() => choose(room.role)}
        >
          {friend ? (canRematch ? 'Rematch with friend' : 'Invite again') : 'Play again'}
        </Button>
        <Button
          variant="secondary"
          disabled={!connected || !available}
          onClick={() => setChoosing(true)}
        >
          Change role
        </Button>
        {rematch?.own ? (
          <Button
            variant="ghost"
            size="text"
            disabled={!connected}
            onClick={() => send({ type: 'rematch', role: null })}
          >
            Cancel rematch
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {!available
          ? 'Please come back for another round later.'
          : rematch?.own
            ? `Your choice: ${rematch.own === 'either' ? 'Either role' : rematch.own}.`
            : `Keep playing as ${room.role === 'human' ? 'the human' : 'the judge'}, or change roles.`}
      </p>
      <div className="border-t border-line pt-4">
        <Button variant="secondary" size="compact" onClick={home}>
          Back to lobby
        </Button>
      </div>
      {choosing ? (
        <Dialog label="Play again" onClose={() => setChoosing(false)}>
          <h2>Choose your next role</h2>
          <div className="grid gap-3">
            <RoleButton
              tone="a"
              title="Play as human"
              disabled={!connected || !available}
              onClick={() => choose('human')}
            >
              Avoid being mistaken for AI.
            </RoleButton>
            <RoleButton
              tone="b"
              title="Play as judge"
              disabled={!connected}
              onClick={() => choose('judge')}
            >
              Find the bot.
            </RoleButton>
            <RoleButton
              tone="neutral"
              title="Either role"
              disabled={!connected}
              onClick={() => choose('either')}
            >
              {canRematch
                ? 'Take the opposite role from your friend.'
                : 'No preference. Choose for me.'}
            </RoleButton>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

export function RematchNotice({ room }: { room: RoomView }) {
  const rematch = room.rematch;

  if (room.matchKind !== 'friend' || !rematch?.available || (!rematch.own && !rematch.other))
    return null;

  const conflict = !!rematch.own && rematch.own !== 'either' && rematch.own === rematch.other;

  return (
    <Banner tone={conflict ? 'warning' : 'info'} role="status">
      <div>
        <strong className="block text-sm">
          {conflict
            ? 'You both chose the same role.'
            : rematch.own
              ? 'Waiting for your friend to join the rematch…'
              : 'Your friend wants a rematch!'}
        </strong>
        <p className="mt-1 text-sm text-ink">
          {conflict
            ? 'One of you needs to switch roles or choose Either role.'
            : rematch.own
              ? 'You can change your role or cancel below.'
              : 'Join below, or change your role.'}
        </p>
      </div>
    </Banner>
  );
}
