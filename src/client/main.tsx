import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  characters,
  ended,
  LIMITS,
  type Command,
  type Event,
  type Label,
  type Lobby,
  type RoomView,
} from '../shared/protocol';
import './styles.css';
const pathCommand = (): Command | null => {
  const path = location.pathname.split('/');
  if (path[1] === 'match' && path[2]) return { type: 'watch', id: path[2] };
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  return invite ? { type: 'join', token: invite } : null;
};
function App() {
  const [lobby, setLobby] = useState<Lobby | null>(null),
    [room, setRoom] = useState<RoomView | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState<string | null>(null),
    [joining, setJoining] = useState(false),
    [inviteRole, setInviteRole] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const initial = useRef(pathCommand());
  const send = (command: Command) => {
    setError(null);
    if (ws.current?.readyState !== WebSocket.OPEN) {
      setError('Connection lost. Return to the lobby to start again.');
      return;
    }
    ws.current.send(JSON.stringify(command));
  };
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | undefined;
    let heartbeat: ReturnType<typeof setInterval>;
    async function start() {
      try {
        await fetch('/api/session');
        if (stopped) return;
        socket = new WebSocket(
          `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
        );
        ws.current = socket;
        socket.onopen = () => {
          setConnected(true);
          heartbeat = setInterval(() => socket?.send(JSON.stringify({ type: 'ping' })), 15_000);
          if (initial.current) {
            socket!.send(JSON.stringify(initial.current));
            initial.current = null;
          }
        };
        socket.onmessage = (e) => {
          const event: Event = JSON.parse(e.data);
          if (event.type === 'lobby') {
            setLobby(event.data);
            setJoining(false);
          } else if (event.type === 'room') {
            setRoom(event.data);
            setJoining(false);
            if (location.pathname !== `/match/${event.data.id}`)
              history.replaceState(null, '', `/match/${event.data.id}`);
          } else if (event.type === 'error') {
            setError(event.message);
            setJoining(false);
          }
        };
        socket.onclose = () => {
          setConnected(false);
          clearInterval(heartbeat);
          if (!stopped) setError('Connection lost. If you were playing, the match has ended.');
        };
        socket.onerror = () => setError('Unable to connect. Please try again.');
      } catch {
        setError('Unable to reach the game. Please try again.');
      }
    }
    void start();
    return () => {
      stopped = true;
      clearInterval(heartbeat);
      socket?.close();
    };
  }, []);
  const home = () => {
    if (room && !ended(room.phase) && room.role !== 'spectator') {
      if (!confirm('Leave this match? It will end for both players.')) return;
      send({ type: 'leave' });
    } else send({ type: 'home' });
    setRoom(null);
    history.replaceState(null, '', '/');
  };
  const play = (role: 'human' | 'judge', invite = false) => {
    setJoining(true);
    setInviteRole(false);
    send({ type: invite ? 'create' : 'queue', role });
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="wordmark" onClick={home} aria-label="The Turing Game home">
          <span className="brand-icon">T</span>THE TURING GAME
        </button>
        <div className="header-meta">
          {lobby?.mock ? <span className="mock-badge">LOCAL TEST · MOCK AI</span> : null}
          <span className={'connection ' + (connected ? 'online' : '')}>
            {connected ? 'Connected' : 'Connecting'}
          </span>
        </div>
      </header>
      {error ? (
        <div role="alert" className="error-banner">
          {error}
          {!connected ? (
            <button onClick={() => location.assign('/')}>Return to lobby</button>
          ) : (
            <button aria-label="Dismiss error" onClick={() => setError(null)}>
              ×
            </button>
          )}
        </div>
      ) : null}
      <main>
        {room ? (
          <Room room={room} send={send} home={home} connected={connected} />
        ) : (
          <>
            <section className="intro">
              <h1>
                Can you tell
                <br />
                the difference<span className="accent">?</span>
              </h1>
              <p className="intro-copy">One human. One AI. Five questions. Choose your role.</p>
            </section>
            <section aria-label="Join a game" className="play-section">
              {lobby?.queued ? (
                <div className="queue-state" role="status">
                  <span className="waiting-mark" />
                  <div>
                    <h2>Finding a {lobby.queued === 'human' ? 'judge' : 'human'}…</h2>
                    <p>You’re playing as {lobby.queued === 'human' ? 'the human' : 'the judge'}.</p>
                  </div>
                  <button className="button secondary" onClick={() => send({ type: 'cancel' })}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="role-grid">
                  <button
                    className="role-card human"
                    disabled={!connected || joining || !lobby?.availability.available}
                    onClick={() => play('human')}
                  >
                    <div>
                      <h2>
                        Play as human <span aria-hidden="true">↗</span>
                      </h2>
                      <p>Convince the judge you’re human.</p>
                    </div>
                  </button>
                  <button
                    className="role-card judge"
                    disabled={!connected || joining || !lobby?.availability.available}
                    onClick={() => play('judge')}
                  >
                    <div>
                      <h2>
                        Play as judge <span aria-hidden="true">↗</span>
                      </h2>
                      <p>Ask questions. Identify the human.</p>
                    </div>
                  </button>
                </div>
              )}
              {!lobby?.availability.available && lobby ? (
                <p className="capacity" role="status">
                  {lobby.availability.message}{' '}
                  {lobby.availability.message?.startsWith('Today')
                    ? `Resets ${new Date(lobby.availability.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
                    : ''}
                </p>
              ) : null}
              {!lobby?.queued ? (
                <div className="invite-row">
                  <button
                    className="text-button"
                    disabled={!connected || !lobby?.availability.available}
                    onClick={() => setInviteRole(!inviteRole)}
                    aria-expanded={inviteRole}
                  >
                    Create an invite room <span aria-hidden="true">↗</span>
                  </button>
                  {inviteRole ? (
                    <div className="invite-options">
                      <button className="button secondary" onClick={() => play('human', true)}>
                        I’ll be the human
                      </button>
                      <button className="button secondary" onClick={() => play('judge', true)}>
                        I’ll be the judge
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
            <section className="live-section">
              <div className="section-heading">
                <h2>
                  Watch live <span className="count">{lobby?.rooms.length ?? 0}</span>
                </h2>
                <span className="muted">Watch and guess.</span>
              </div>
              {lobby?.rooms.length ? (
                <div className="live-grid">
                  {lobby.rooms.map((m) => (
                    <button
                      key={m.id}
                      className="live-card"
                      onClick={() => send({ type: 'watch', id: m.id })}
                    >
                      <div>
                        <span className="eyebrow">
                          <span className="live-dot" /> LIVE
                        </span>
                        <span className="muted">{m.spectators} watching</span>
                      </div>
                      <h3>Match {m.id.slice(0, 6).toUpperCase()}</h3>
                      <div>
                        <span>Question {m.round} of 5</span>
                        <span className="accent">Watch ↗</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-live">
                  <span className="empty-symbol" aria-hidden="true">
                    —
                  </span>
                  <p>
                    No games in progress.
                    <br />
                    <span className="muted">Choose a role above to start one.</span>
                  </p>
                </div>
              )}
            </section>
            <p className="public-note">
              All games are public. Conversations and results are saved.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  if (!deadline) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={'timer ' + (seconds < 20 ? 'urgent' : '')}
      aria-label={`${seconds} seconds remaining`}
    >
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}
function Composer({
  label,
  limit,
  onSubmit,
  button,
  disabled = false,
}: {
  label: string;
  limit: number;
  onSubmit: (text: string) => void;
  button: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  const count = characters(value);
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim() && count <= limit) {
          onSubmit(value);
        }
      }}
    >
      <label htmlFor="message">{label}</label>
      <textarea
        ref={input}
        id="message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={label}
        rows={3}
        aria-describedby="character-count"
        maxLength={8000}
        disabled={disabled}
      />
      <div className="composer-bottom">
        <span
          id="character-count"
          className={count > limit ? 'over-limit' : count > limit - 30 ? 'near-limit' : 'muted'}
        >
          {limit - count} characters remaining
        </span>
        <button className="button primary" disabled={disabled || !value.trim() || count > limit}>
          {button} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}
function Room({
  room,
  send,
  home,
  connected,
}: {
  room: RoomView;
  send: (c: Command) => void;
  home: () => void;
  connected: boolean;
}) {
  const [choice, setChoice] = useState<Label | null>(null),
    [reason, setReason] = useState(''),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (ended(room.phase)) window.scrollTo({ top: 0 });
  }, [room.phase]);
  const done = ended(room.phase),
    isJudge = room.role === 'judge',
    isHuman = room.role === 'human';
  const copy = async (invite = false) => {
    try {
      await navigator.clipboard.writeText(
        invite
          ? `${location.origin}/#invite=${room.inviteToken}`
          : `${location.origin}/match/${room.id}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const status =
    room.phase === 'question'
      ? 'Waiting for the judge’s question'
      : room.phase === 'answer' || room.phase === 'generating'
        ? 'Answers will appear together'
        : room.phase === 'verdict'
          ? 'The judge is making the final call'
          : room.phase === 'waiting'
            ? 'Waiting for your opponent'
            : room.phase === 'complete'
              ? 'The verdict is in'
              : 'Match ended';
  return (
    <div className="room-page">
      <div className="room-topline">
        <button className="text-button" onClick={home}>
          {!done && room.role !== 'spectator' ? 'Leave match' : '← Lobby'}
        </button>
        <span className="eyebrow">MATCH {room.id.slice(0, 6).toUpperCase()}</span>
        <button className="text-button" onClick={() => copy()}>
          {copied ? 'Copied' : 'Copy match link'}
        </button>
      </div>
      <div className="room-title">
        <div>
          <p className="eyebrow">
            {room.role === 'spectator'
              ? 'SPECTATING'
              : isJudge
                ? 'YOU ARE THE JUDGE'
                : `YOU ARE CONTESTANT ${room.ownLabel}`}
          </p>
          <h1>
            {done
              ? room.phase === 'complete'
                ? 'The reveal.'
                : 'Match ended.'
              : room.phase === 'waiting'
                ? 'Invite your opponent.'
                : `Question ${Math.min(5, room.phase === 'question' ? room.rounds.length + 1 : Math.max(1, room.rounds.length))}`}
            <span className="round-total">{done || room.phase === 'waiting' ? '' : ' / 5'}</span>
          </h1>
        </div>
        <Countdown deadline={room.deadline} />
      </div>
      {room.phase === 'waiting' ? (
        <div className="waiting-panel">
          <p>
            Share this invitation with your {room.openRole === 'judge' ? 'judge' : 'human opponent'}
            . The match starts when they join.
          </p>
          {room.inviteToken ? (
            <>
              <input
                aria-label="Invitation link"
                readOnly
                value={`${location.origin}/#invite=${room.inviteToken}`}
              />
              <button className="button primary" onClick={() => copy(true)}>
                {copied ? 'Copied' : 'Copy invitation'}
              </button>
            </>
          ) : (
            <p>Waiting for the invited player.</p>
          )}
          <p className="muted">Anyone can watch. Only the invited player can take the open seat.</p>
        </div>
      ) : null}
      {room.result ? (
        <section className="result-panel">
          <p className="eyebrow">
            {room.result.humanWon ? 'HUMAN IDENTIFIED' : 'THE AI FOOLED THE JUDGE'}
          </p>
          <h2>Contestant {room.result.humanLabel} was human.</h2>
          <p>
            The judge chose {room.result.choice}.
            {room.result.humanWon ? ' Human wins.' : ' AI wins.'}
          </p>
          {room.result.reason ? (
            <blockquote>
              “{room.result.reason}”<cite>The judge’s reasoning</cite>
            </blockquote>
          ) : null}
          <div className="audience-result">
            <span>Audience guesses</span>
            <span>
              A <strong>{room.result.votes.A}</strong>
            </span>
            <span>
              B <strong>{room.result.votes.B}</strong>
            </span>
          </div>
        </section>
      ) : null}
      {room.message ? (
        <div className="ended-panel" role="status">
          {room.message}
        </div>
      ) : null}
      <div className="transcript">
        {room.rounds.map((round, i) => (
          <section className="round" key={i}>
            <div className="question-line">
              <span className="question-number">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <p className="eyebrow">THE JUDGE ASKED</p>
                <h2>{round.question}</h2>
              </div>
            </div>
            {round.answers ? (
              <div className="answer-grid">
                {(['A', 'B'] as Label[]).map((label) => (
                  <article className="answer-card" key={label}>
                    <div className="answer-label">
                      <span className="label-square">{label}</span>
                      <span>Contestant {label}</span>
                      {room.result ? (
                        <span className="identity">
                          {room.result.humanLabel === label ? 'HUMAN' : 'AI'}
                        </span>
                      ) : null}
                    </div>
                    <p>{round.answers![label]}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="unrevealed">
                <span className="waiting-mark" />
                <span>
                  {done
                    ? 'This round was not completed.'
                    : isHuman && room.ownAnswer
                      ? 'Your answer is locked in. Waiting for the reveal.'
                      : 'Both answers are hidden until they’re ready.'}
                </span>
              </div>
            )}
          </section>
        ))}
      </div>
      {!done && room.phase !== 'waiting' ? (
        <section className="action-panel" aria-label="Your turn">
          {isJudge && room.phase === 'question' ? (
            <Composer
              key={`q${room.rounds.length}`}
              label={room.rounds.length ? 'Ask your next question' : 'Ask your first question'}
              limit={LIMITS.question}
              onSubmit={(text) => send({ type: 'question', text })}
              button="Ask both contestants"
              disabled={!connected}
            />
          ) : isHuman && room.phase === 'answer' ? (
            <Composer
              key={`a${room.rounds.length}`}
              label="Write your answer"
              limit={LIMITS.answer}
              onSubmit={(text) => send({ type: 'answer', text })}
              button="Lock in answer"
              disabled={!connected}
            />
          ) : isJudge && room.phase === 'verdict' ? (
            <form
              className="verdict-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (choice) send({ type: 'verdict', choice, reason });
              }}
            >
              <h2>Who is human?</h2>
              <div className="choice-row">
                {(['A', 'B'] as Label[]).map((label) => (
                  <button
                    type="button"
                    className={'choice ' + (choice === label ? 'selected' : '')}
                    aria-pressed={choice === label}
                    onClick={() => setChoice(label)}
                    key={label}
                  >
                    Contestant {label}
                  </button>
                ))}
              </div>
              <label htmlFor="reason">
                What gave them away? <span className="muted">(optional)</span>
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={8000}
              />
              <div className="composer-bottom">
                <span className={characters(reason) > LIMITS.reason ? 'over-limit' : 'muted'}>
                  {LIMITS.reason - characters(reason)} characters remaining
                </span>
                <button
                  className="button primary"
                  disabled={!choice || !connected || characters(reason) > LIMITS.reason}
                >
                  Submit verdict & reveal
                </button>
              </div>
            </form>
          ) : (
            <p className="turn-status" role="status">
              {status}
            </p>
          )}
          {room.role === 'spectator' ? (
            <div className="spectator-vote">
              <div>
                <h2>Who do you think is human?</h2>
                <p>Your guess stays hidden until the verdict.</p>
              </div>
              <div className="choice-row">
                {(['A', 'B'] as Label[]).map((label) => (
                  <button
                    key={label}
                    className={'choice ' + (room.vote === label ? 'selected' : '')}
                    aria-pressed={room.vote === label}
                    disabled={!connected}
                    onClick={() => send({ type: 'vote', choice: label })}
                  >
                    {label}
                    {room.vote === label ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {done ? (
        <div className="postgame">
          <button className="button primary" onClick={home}>
            Back to lobby ↗
          </button>
          <span className="muted">This match is saved. Share its link to replay.</span>
        </div>
      ) : (
        <p className="public-note">
          {room.spectatorCount} watching
          {room.role !== 'spectator' ? ' · Leaving or disconnecting ends your match.' : ''}
        </p>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
