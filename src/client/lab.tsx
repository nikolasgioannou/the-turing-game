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
    <main className="feedback-lab">
      <nav className="lab-nav">
        <a href="/">← Back to game</a>
        <a href="/api/lab/export" download>
          Export feedback
        </a>
      </nav>
      <header>
        <p className="eyebrow">HUMAN CHECK · ROUND 2</p>
        <h1>Which feels real?</h1>
        <p>Help tune the chat. Quick comparisons, your judgment. No training.</p>
      </header>
      <div className="lab-progress">
        <span>{state ? `${state.rated} / ${state.total} rated` : 'Loading…'}</span>
        <span>
          {state?.checkUnlocked
            ? 'Fresh check set'
            : `Practice set · ${state?.practiceTotal ?? 8} scenarios`}
        </span>
      </div>
      {!!state?.previousRated && (
        <p className="lab-note">
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
          <section className="lab-context" aria-label="Scenario">
            <div>
              <span className="eyebrow">JUDGE ASKS</span>
              <p>{state.pair.question}</p>
            </div>
            <div>
              <span className="eyebrow">HUMAN STYLE SAMPLE</span>
              <p>{state.pair.human}</p>
            </div>
          </section>
          <p className="lab-instruction">
            Which reply fits this human voice while independently answering the judge?
          </p>
          <div className="lab-candidates">
            {(['a', 'b'] as const).map((side) => (
              <button
                key={side}
                className={'lab-candidate ' + (choice === side ? 'selected' : '')}
                aria-pressed={choice === side}
                onClick={() => setChoice(side)}
                disabled={busy}
              >
                <span className="eyebrow">REPLY {side.toUpperCase()}</span>
                <p>{state.pair![side]}</p>
              </button>
            ))}
          </div>
          <fieldset className="lab-votes">
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
          <details className="lab-details" open>
            <summary>
              What felt off? <span className="muted">Optional</span>
            </summary>
            <div className="lab-chips">
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
            <div className="lab-edits">
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
          <footer className="lab-footer">
            <span>Reply order is randomized. Neither is marked as the current version.</span>
            <button className="button primary" disabled={!choice || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save feedback'}
            </button>
          </footer>
        </>
      ) : (
        <section className="lab-ready" aria-live="polite">
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
      <p className="lab-note">
        {state?.practiceTotal ?? 8} practice scenarios, then {state?.checkTotal ?? 8} reserved
        checks. Ratings stay in the local database. Export includes version details for review; no
        feedback is used for training.
      </p>
    </main>
  );
}
