import { Button, Dialog } from './ui';

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Dialog label="How to play" onClose={onClose}>
      <p className="eyebrow">THE RULES</p>
      <h2>How to play</h2>
      <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed marker:text-accent">
        <li>
          <strong>Choose a side.</strong> Play as the human contestant or the judge. Find a player
          or invite a friend.
        </li>
        <li>
          <strong>Meet A and B.</strong> One contestant is human and the other is AI. The judge must
          work out which is which.
        </li>
        <li>
          <strong>Answer the opener.</strong> The judge asks a question. Both contestants answer
          privately, then their replies appear together.
        </li>
        <li>
          <strong>Chat for up to 90 seconds.</strong> Everyone can ask questions and respond. As the
          human, convince the judge to pick you. As the judge, test both contestants.
        </li>
        <li>
          <strong>Make the call.</strong> The judge can guess during chat or when time runs out.
          Pick the human and the human wins. Pick the AI and the AI wins. Both identities are
          revealed.
        </li>
      </ol>
      <p className="text-muted">
        The AI can use opening answers and live drafts from the human contestant to adapt its style.
        Unsent drafts stay private. Sent conversations and results are saved for replay.
      </p>
      <Button className="mt-2 w-full" onClick={onClose}>
        Got it
      </Button>
    </Dialog>
  );
}
