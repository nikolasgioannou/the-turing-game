import { Button, Dialog } from './ui';

export function WaitingForJudge({ onClose }: { onClose: () => void }) {
  return (
    <Dialog label="Waiting for the judge" onClose={onClose}>
      <div className="mb-5 flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-3 bg-player-b motion-safe:animate-bounce"
            style={{ animationDelay: `${index * 150}ms` }}
          />
        ))}
      </div>
      <h2>Waiting for the judge</h2>
      <p>Chat is over. The judge is deciding who is the bot.</p>
      <p className="text-muted">Your result will appear automatically.</p>
      <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
        View conversation
      </Button>
    </Dialog>
  );
}
