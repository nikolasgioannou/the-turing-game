import { useEffect, useState } from 'react';
import { feedbackTags, type LabChoice, type LabState } from '../shared/lab';

const choices: { id: LabChoice; label: string }[] = [
  { id: 'a', label: 'A sounds more human' },
  { id: 'b', label: 'B sounds more human' },
  { id: 'both_bad', label: 'Both bad' },
  { id: 'both_good', label: 'Both good' },
];

export function FeedbackLab() {
  const [state, setState] = useState<LabState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [choice, setChoice] = useState<LabChoice | null>(null),
    [tags, setTags] = useState<string[]>([]),
    [rewrite, setRewrite] = useState(''),
    [note, setNote] = useState(''),
    [saved, setSaved] = useState(false);

  async function request(path: string, body?: unknown) {
    const res = await fetch(
      '/api/lab/' + path,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    const data = await res.json();

    if (!res.ok) throw Error(data.error || 'Something went wrong');

    return data as LabState;
  }

  useEffect(() => {
    void (async () => {
      try {
        await fetch('/api/session');
        setState(await request('state'));
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    })();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        busy ||
        !state?.pair ||
        (e.target instanceof HTMLElement &&
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName))
      )
        return;

      const c = choices[Number(e.key) - 1];

      if (c) {
        e.preventDefault();
        setChoice(c.id);
      }
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, [busy, state?.pair]);

  async function next() {
    setBusy(true);
    setError('');

    try {
      setState(await request('next', { set: state?.checkUnlocked ? 'check' : 'practice' }));
      setChoice(null);
      setTags([]);
      setRewrite('');
      setNote('');
      setSaved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!state?.pair || !choice) return;

    setBusy(true);
    setError('');

    try {
      setState(await request('rate', { id: state.pair.id, choice, tags, rewrite, note }));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const complete = state && state.rated >= state.total;

  return (
    <main className="feedback-lab mx-auto max-w-[1040px] px-6 pt-7 pb-12 max-[600px]:px-4 max-[600px]:py-5">
      <nav className="lab-nav mb-8 flex items-center justify-between gap-4 text-[13px] text-[#9cc4d0] max-[600px]:mb-6">
        <a href="/">← Back to game</a>
        <a href="/api/lab/export" download>
          Export feedback
        </a>
      </nav>
      <header>
        <p className="eyebrow">HUMAN CHECK · ROUND 2</p>
        <h1 className="my-2 font-arcade text-[clamp(24px,4vw,36px)] leading-normal text-ink">
          Which feels real?
        </h1>
        <p className="text-[15px] leading-relaxed text-caption">
          Help tune the chat. Quick comparisons, your judgment. No training.
        </p>
      </header>
      <div className="lab-progress mb-6 flex items-center justify-between gap-4 border-b border-[#334149] py-4 text-xs text-[#9cc4d0] max-[600px]:items-start">
        <span>{state ? `${state.rated} / ${state.total} rated` : 'Loading…'}</span>
        <span>
          {state?.checkUnlocked
            ? 'Fresh check set'
            : `Practice set · ${state?.practiceTotal ?? 8} scenarios`}
        </span>
      </div>
      {!!state?.previousRated && (
        <p className="lab-note mt-7 text-xs leading-relaxed text-[#80969e]">
          Your {state.previousRated} earlier ratings are saved. This batch compares the previous
          version with the revision.
        </p>
      )}
      {error && (
        <div role="alert" className="error-banner">
          {error}
          <button className="text-button" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}
      {state?.pair ? (
        <>
          <section
            className="lab-context grid grid-cols-2 gap-4 border border-line bg-panel p-[18px] max-[600px]:grid-cols-1 [&_.eyebrow]:text-[10px] [&_.eyebrow]:text-caption [&_p]:mt-2 [&_p]:leading-normal [&_p]:wrap-anywhere [&_p]:whitespace-pre-wrap"
            aria-label="Scenario"
          >
            <div>
              <span className="eyebrow">JUDGE ASKS</span>
              <p>{state.pair.question}</p>
            </div>
            <div>
              <span className="eyebrow">HUMAN STYLE SAMPLE</span>
              <p>{state.pair.human}</p>
            </div>
          </section>
          <p className="lab-instruction mt-6 mb-3.5 text-sm leading-normal text-caption">
            Which reply fits this human voice while independently answering the judge?
          </p>
          <div className="lab-candidates grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
            {(['a', 'b'] as const).map((side) => (
              <button
                key={side}
                className="lab-candidate min-h-[136px] border-2 border-[#46575e] bg-[#142027] p-5 text-left text-ink aria-pressed:border-player-a aria-pressed:bg-[#29201a] max-[600px]:min-h-[110px] max-[600px]:p-4 [&_.eyebrow]:text-[10px] [&_.eyebrow]:text-caption [&_p]:mt-3.5 [&_p]:text-[19px] [&_p]:leading-normal [&_p]:wrap-anywhere [&_p]:whitespace-pre-wrap max-[600px]:[&_p]:text-[17px]"
                aria-pressed={choice === side}
                onClick={() => setChoice(side)}
                disabled={busy}
              >
                <span className="eyebrow">REPLY {side.toUpperCase()}</span>
                <p>{state.pair![side]}</p>
              </button>
            ))}
          </div>
          <fieldset className="lab-votes my-5 flex flex-wrap gap-2.5 border-0 p-0 [&_.choice]:text-[13px] max-[600px]:[&_.choice]:flex-[1_1_44%] [&_kbd]:mr-1 [&_kbd]:text-[11px] [&_kbd]:opacity-55 [&_legend]:mb-2.5 [&_legend]:text-[13px] [&_legend]:text-caption">
            <legend>Your pick</legend>
            {choices.map((c, i) => (
              <button
                type="button"
                className={'choice ' + (choice === c.id ? 'selected' : '')}
                key={c.id}
                aria-pressed={choice === c.id}
                onClick={() => setChoice(c.id)}
                disabled={busy}
              >
                <kbd aria-hidden="true">{i + 1}</kbd> {c.label}
              </button>
            ))}
          </fieldset>
          <details
            className="lab-details mt-6 border-t border-[#334149] pt-[18px] [&_summary]:cursor-pointer [&_summary]:text-sm [&_summary_.muted]:ml-2 [&_summary_.muted]:text-xs"
            open
          >
            <summary>
              What felt off? <span className="muted">Optional</span>
            </summary>
            <div className="lab-chips my-4 flex flex-wrap gap-2 [&_button]:border [&_button]:border-[#46575e] [&_button]:bg-[#111c21] [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs [&_button]:text-[#becdd1] [&_button[aria-pressed=true]]:border-player-b [&_button[aria-pressed=true]]:bg-[#132c35] [&_button[aria-pressed=true]]:text-player-b">
              {feedbackTags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  aria-pressed={tags.includes(tag)}
                  onClick={() =>
                    setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])
                  }
                  disabled={busy}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="lab-edits grid grid-cols-2 gap-4 max-[600px]:grid-cols-1 [&_label]:text-[13px] [&_label]:leading-relaxed [&_textarea]:mt-2 [&_textarea]:block [&_textarea]:min-h-[74px] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:p-2.5 [&_textarea]:text-sm">
              <label>
                What would you say instead? <span className="muted">Optional</span>
                <textarea
                  value={rewrite}
                  onChange={(e) => setRewrite(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Type a reply in the same voice"
                  disabled={busy}
                />
              </label>
              <label>
                Anything else? <span className="muted">Optional</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="A note about either reply"
                  disabled={busy}
                />
              </label>
            </div>
          </details>
          <footer className="lab-footer mt-[22px] flex items-center justify-between gap-4 max-[600px]:flex-col max-[600px]:items-stretch [&_.button]:px-5 [&_.button]:py-3 [&_.button]:text-sm [&_.button]:whitespace-nowrap [&>span]:text-xs [&>span]:leading-relaxed [&>span]:text-[#80969e]">
            <span>Reply order is randomized. Neither is marked as the current version.</span>
            <button className="button primary" disabled={!choice || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save feedback'}
            </button>
          </footer>
        </>
      ) : (
        <section
          className="lab-ready border border-[#46575e] bg-panel px-6 py-8 max-[600px]:px-[18px] max-[600px]:py-6 [&_.button]:text-[15px] [&_h2]:mb-3 [&_h2]:text-[22px] [&_h2]:text-ink [&_p]:mb-6 [&_p]:max-w-[640px] [&_p]:leading-[1.65] [&_p]:text-caption"
          aria-live="polite"
        >
          <h2>
            {complete
              ? 'Batch complete'
              : saved
                ? 'Saved. Thank you.'
                : 'Five minutes. A few quick picks.'}
          </h2>
          <p>
            {complete
              ? 'Your feedback is ready to review. No prompt or model was changed automatically.'
              : saved
                ? 'Stop here whenever you like. Your progress is saved in this browser session.'
                : 'Read the question and human sample, compare two replies, then pick A, B, both bad or both good. A rewrite is helpful but never required.'}
          </p>
          {!complete && (
            <button className="button primary" onClick={next} disabled={!state || busy}>
              {busy ? 'Writing two replies…' : saved ? 'Next comparison' : 'Start comparing'}
            </button>
          )}
          {busy && <p role="status">Using the local model. This usually takes a few seconds.</p>}
          {complete && (
            <a className="button primary" href="/api/lab/export" download>
              Download feedback
            </a>
          )}
        </section>
      )}
      <p className="lab-note mt-7 text-xs leading-relaxed text-[#80969e]">
        {state?.practiceTotal ?? 8} practice scenarios, then {state?.checkTotal ?? 8} reserved
        checks. Ratings stay in the local database. Export includes version details for review; no
        feedback is used for training.
      </p>
    </main>
  );
}
