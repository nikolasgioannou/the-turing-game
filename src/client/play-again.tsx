import { useState } from 'react';
import type { Command, QueuePreference, RoomView } from '../shared/protocol';
import { Button, Dialog, RoleButton } from './ui';

export function PlayAgain({
  room,
  connected,
  send,
  play,
  home,
}: {
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
  const conflict = !!rematch?.own && rematch.own !== 'either' && rematch.own === rematch.other;
  const choose = (role: QueuePreference) => {
    setChoosing(false);

    if (canRematch) send({ type: 'rematch', role });
    else play(role, friend);
  };

  return (
    <section className="mt-7 mb-8 space-y-4" aria-label="Play again">
      {friend ? (
        <p className="text-sm text-muted" role="status">
          {!canRematch
            ? 'Your friend has left. Send a new invitation to play again.'
            : conflict
              ? 'You both chose the same role. Change roles or choose Either role.'
              : rematch?.own
                ? 'Waiting for your friend to join the rematch…'
                : rematch?.other
                  ? 'Your friend wants to play again. Choose your role to join.'
                  : 'Play another round with your friend. Both of you need to join.'}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!connected || (!!rematch?.own && !!canRematch)}
          onClick={() => choose(room.role)}
        >
          {friend ? (canRematch ? 'Rematch with friend' : 'Invite again') : 'Play again'}
        </Button>
        <Button variant="secondary" disabled={!connected} onClick={() => setChoosing(true)}>
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
        <Button variant="ghost" size="text" onClick={home}>
          Back to lobby
        </Button>
      </div>
      <p className="text-xs text-muted">
        {rematch?.own
          ? `Your choice: ${rematch.own === 'either' ? 'Either role' : rematch.own}.`
          : `Keep playing as ${room.role === 'human' ? 'the human' : 'the judge'}, or change roles.`}
      </p>
      {choosing ? (
        <Dialog label="Play again" onClose={() => setChoosing(false)}>
          <h2>Choose your next role</h2>
          <div className="grid gap-3">
            <RoleButton
              tone="a"
              title="Play as human"
              disabled={!connected}
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
