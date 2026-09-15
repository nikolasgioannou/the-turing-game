import { IdentityIcon } from './ui/identity-icon';
import type { ChatMessage } from '../shared/protocol';

const senderStyles = {
  A: { text: 'text-player-a', badge: 'bg-player-a' },
  B: { text: 'text-player-b', badge: 'bg-player-b' },
  judge: { text: 'text-judge', badge: 'bg-judge' },
};

export function ChatMessageItem({
  message,
  own,
  revealedIdentity,
}: {
  message: ChatMessage;
  own: boolean;
  revealedIdentity?: 'human' | 'bot';
}) {
  const colors = senderStyles[message.sender];

  return (
    <article
      data-sender={message.sender}
      className={`chat-message flex w-fit max-w-[82%] shrink-0 flex-col items-start gap-[5px] py-1.5 max-[640px]:max-w-[90%] ${own ? 'own-message self-end' : 'self-start'}`}
    >
      <div
        className={`chat-sender flex flex-wrap items-center gap-2 text-[11px] leading-normal max-[640px]:flex-nowrap max-[640px]:text-[10px] ${colors.text}`}
      >
        {revealedIdentity || message.sender === 'judge' ? (
          <IdentityIcon kind={message.sender === 'judge' ? 'judge' : revealedIdentity!} />
        ) : (
          <span
            className={`inline-flex size-5 shrink-0 items-center justify-center font-arcade text-[10px] leading-none text-[#111] ${colors.badge}`}
          >
            {message.sender}
          </span>
        )}
        <span>
          {revealedIdentity
            ? own
              ? 'You'
              : revealedIdentity === 'bot'
                ? 'Bot'
                : 'Human'
            : message.sender === 'judge'
              ? 'Judge'
              : `Contestant ${message.sender}`}
        </span>
      </div>
      <p className="m-0 text-base leading-[1.55] wrap-anywhere whitespace-pre-wrap text-[#f3e9d5] max-[640px]:text-sm">
        {message.text}
      </p>
    </article>
  );
}
