import { useState } from 'react';
import { Button, Dialog } from './ui';

const slides = [
  {
    title: 'Choose your role',
    body: 'Play as the judge or the human. Pick Either role to let us choose.',
    detail: 'Find a match or invite a friend. One contestant is human. The other is AI.',
  },
  {
    title: 'Chat for 90 seconds',
    body: 'The judge asks questions to test both contestants.',
    detail: 'Playing as the human? Be yourself and convince the judge you’re real.',
  },
  {
    title: 'Find the bot',
    body: 'The judge picks the AI—anytime during chat, or when time runs out.',
    detail: 'Pick the bot: you both win. Pick the human: you both lose. Then we reveal who’s who.',
  },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const last = step === slides.length - 1;

  return (
    <Dialog label="How to play" onClose={onClose}>
      <p className="eyebrow">
        HOW TO PLAY · {step + 1} / {slides.length}
      </p>
      <section aria-live="polite" aria-atomic="true" className="min-h-56">
        <h2>{slide.title}</h2>
        <p className="text-sm leading-relaxed">{slide.body}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted">{slide.detail}</p>
      </section>
      <div className="mt-6 flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          className={step === 0 ? 'invisible' : ''}
          onClick={() => setStep(step - 1)}
          tabIndex={step === 0 ? -1 : undefined}
        >
          Back
        </Button>
        <div className="flex gap-2" aria-hidden="true">
          {slides.map((_, index) => (
            <span key={index} className={`size-2 ${index === step ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
        <Button className="min-w-28" onClick={() => (last ? onClose() : setStep(step + 1))}>
          {last ? 'Got it' : 'Next'}
        </Button>
      </div>
    </Dialog>
  );
}
