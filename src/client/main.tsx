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
import './arcade.css';
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
    [inviteRole, setInviteRole] = useState(false),
    [startOpen, setStartOpen] = useState(false);
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
        const response = await fetch('/api/session');
        if (!response.ok) throw new Error('Session unavailable');
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
            setStartOpen(false);
            setJoining(false);
            if (location.pathname !== `/match/${event.data.id}`)
              history.replaceState(null, '', `/match/${event.data.id}`);
          } else if (event.type === 'error') {
            setError(event.message);
            setStartOpen(false);
            setJoining(false);
          }
        };
        socket.onclose = () => {
          setConnected(false);
          setStartOpen(false);
          clearInterval(heartbeat);
          if (!stopped) setError('Connection lost. If you were playing, the match has ended.');
        };
        socket.onerror = () => {
          setError('Unable to connect. Please try again.');
        };
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
            <section className="compact-lobby arcade-lobby">
              <div className="cabinet-top">
                <span>HUMAN VS MACHINE</span>
                <span>60 SECOND SHOWDOWN</span>
              </div>
              <h1 className="arcade-logo">
                <span>THE</span>TURING GAME
              </h1>
              <p className="arcade-tagline">One human. One AI. Sixty seconds.</p>
              <div className="lobby-actions">
                <button
                  className="button primary"
                  aria-label="Start game"
                  disabled={
                    !connected || joining || !!lobby?.queued || !lobby?.availability.available
                  }
                  onClick={() => setStartOpen(true)}
                >
                  Start game
                </button>
              </div>
              {lobby && !lobby.availability.available ? (
                <p className="capacity" role="status">
                  {lobby.availability.message}
                </p>
              ) : null}
              <ArcadeStage />
            </section>
            {startOpen ? (
              <StartDialog
                close={() => {
                  if (joining || lobby?.queued) send({ type: 'cancel' });
                  setJoining(false);
                  setStartOpen(false);
                  setInviteRole(false);
                }}
              >
                {joining || lobby?.queued ? (
                  <>
                    <p className="eyebrow">MATCHMAKING</p>
                    <h2>Finding an opponent</h2>
                    <div className="compact-queue" role="status">
                      <span className="waiting-mark" />
                      {lobby?.queued
                        ? `Finding a ${lobby.queued === 'human' ? 'judge' : 'human'}…`
                        : 'Joining…'}
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => {
                        send({ type: 'cancel' });
                        setJoining(false);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <p className="eyebrow">PLAYER SELECT</p>
                    <h2>Choose your side</h2>
                    <div className="dialog-modes" aria-label="Game type">
                      <button
                        className={!inviteRole ? 'selected' : ''}
                        aria-pressed={!inviteRole}
                        onClick={() => setInviteRole(false)}
                      >
                        Find a match
                      </button>
                      <button
                        className={inviteRole ? 'selected' : ''}
                        aria-pressed={inviteRole}
                        onClick={() => setInviteRole(true)}
                      >
                        Invite a friend
                      </button>
                    </div>
                    <p className="muted">
                      {inviteRole
                        ? 'Choose your role, then share the invitation.'
                        : 'Choose your role. We will find your opponent.'}
                    </p>
                    <div className="dialog-roles">
                      <button
                        disabled={!connected || joining || !lobby?.availability.available}
                        onClick={() => play('human', inviteRole)}
                      >
                        <strong>Play as human</strong>
                        <span>Convince the judge you are human.</span>
                      </button>
                      <button
                        disabled={!connected || joining || !lobby?.availability.available}
                        onClick={() => play('judge', inviteRole)}
                      >
                        <strong>Play as judge</strong>
                        <span>Chat with both. Identify the human.</span>
                      </button>
                    </div>
                  </>
                )}
              </StartDialog>
            ) : null}
            <p className="public-note">Conversations and results are saved.</p>
          </>
        )}
      </main>
    </div>
  );
}
function ArcadeStage() {
  return (
    <div className="arcade-stage" aria-label="Two contestants face a judge. Identify the human.">
      <svg viewBox="0 0 640 250" aria-hidden="true" shapeRendering="crispEdges">
        <defs>
          <linearGradient id="stage-light" x2="0" y2="1">
            <stop stopColor="#41616b" stopOpacity=".22" />
            <stop offset="1" stopColor="#41616b" stopOpacity="0" />
          </linearGradient>
          <g id="mystery-player">
            {/* Identical portraits keep the illustration neutral about identity. */}
            <path
              d="M-42 0V-24H-32V-36H-18V-48H-22V-56H-28V-88H-22V-100H-10V-106H14V-100H24V-88H28V-62H22V-48H16V-36H32V-26H42V0Z"
              fill="#17232a"
            />
            <path
              d="M-28-88H-22V-100H-10V-106H14V-100H24V-94H-12V-86H-20V-62H-28Z"
              fill="currentColor"
              opacity=".8"
            />
            <path
              d="M24-88H28V-62H22V-48H16V-36H32V-26H42V0H28V-20H12V-30H4V-48H14V-60H20V-88Z"
              fill="currentColor"
              opacity=".25"
            />
            <path d="M-18-36L0-20L16-36M0-20V0" fill="none" stroke="#34434a" strokeWidth="4" />
            <path d="M-38-22H-26V-28H-18" fill="none" stroke="currentColor" strokeWidth="3" />
          </g>
        </defs>
        {/* Overhead lights and a perspective floor establish an arcade stage. */}
        <path d="M104 16H184L256 192H32ZM456 16H536L608 192H384Z" fill="url(#stage-light)" />
        <path d="M104 12H184V16H104ZM456 12H536V16H456Z" fill="#47616a" />
        <path
          d="M0 184H640M0 206H640M0 240H640M320 170L32 250M320 170L168 250M320 170V250M320 170L472 250M320 170L608 250"
          fill="none"
          stroke="#19313a"
          strokeWidth="1"
        />
        {/* Contestant stations. */}
        {[
          { x: 144, color: '#ff803e' },
          { x: 496, color: '#42d4fa' },
        ].map(({ x, color }) => (
          <g key={x} style={{ color }}>
            <ellipse cx={x} cy="200" rx="88" ry="10" fill="#020709" />
            <use href="#mystery-player" transform={`translate(${x} 150)`} />
            <path d={`M${x - 78} 154H${x + 78}V166H${x - 78}Z`} fill="#34434a" />
            <path d={`M${x - 72} 166H${x + 72}V196H${x - 72}Z`} fill="#111e24" />
            <path d={`M${x - 72} 166H${x + 72}V170H${x - 72}Z`} fill={color} />
            <path
              d={`M${x - 66} 174H${x - 58}V192H${x - 66}ZM${x + 58} 174H${x + 66}V192H${x + 58}Z`}
              fill="#263b44"
            />
            <rect
              x={x + 26}
              y="112"
              width="42"
              height="32"
              fill="#080e12"
              stroke="#40535b"
              strokeWidth="3"
            />
            <rect x={x + 31} y="117" width="32" height="21" fill={color} opacity=".18" />
            <path
              d={`M${x + 36} 124H${x + 55}M${x + 36} 130H${x + 48}`}
              stroke={color}
              strokeWidth="2"
            />
            <path
              d={`M${x + 45} 145V151M${x + 35} 152H${x + 58}`}
              stroke="#647780"
              strokeWidth="3"
            />
            <path d={`M${x - 40} 148H${x - 10}V152H${x - 40}Z`} fill={color} opacity=".5" />
            <rect x={x - 3} y="180" width="6" height="6" fill={color} />
          </g>
        ))}
        {/* Judge seen from behind, with a broad chair and two contestant feeds. */}
        <path d="M250 190H390L408 230H232Z" fill="#29383c" />
        <path d="M250 192H390" stroke="#8f8265" strokeWidth="3" />
        <path
          d="M252 165H292V192H252ZM348 165H388V192H348Z"
          fill="#080e12"
          stroke="#5b6260"
          strokeWidth="3"
        />
        <path d="M258 172H286V184H258Z" fill="#ff803e" opacity=".35" />
        <path d="M354 172H382V184H354Z" fill="#42d4fa" opacity=".35" />
        <path
          d="M268 235V208H280V190H300V170H294V145H300V132H312V126H332V132H342V146H346V164H340V178H338V190H358V208H372V235Z"
          fill="#151d20"
        />
        <path d="M294 145H300V132H312V126H332V132H342V140H310V148H304V169H294Z" fill="#a78b5b" />
        <path d="M338 148H346V164H340V178H330V185H314V179H330V170H338Z" fill="#554937" />
        <path
          d="M282 208V196H298V202H342V196H358V208"
          fill="none"
          stroke="#6a634f"
          strokeWidth="4"
        />
        <path d="M276 216H364V246H276Z" fill="#233139" stroke="#526064" strokeWidth="3" />
        <path d="M286 223H354M286 229H354" stroke="#33474f" strokeWidth="2" />
        <path d="M230 239H274M366 239H410" stroke="#cfa76b" strokeWidth="4" />
      </svg>
      <div className="stage-labels">
        <span>A</span>
        <span>JUDGE</span>
        <span>B</span>
      </div>
      <p>Real people? Machines? You decide.</p>
    </div>
  );
}
function StartDialog({ close, children }: { close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="start-dialog"
      aria-label="Start a game"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-content">
        <button className="dialog-close" aria-label="Close dialog" onClick={close}>
          ×
        </button>
        {children}
      </div>
    </dialog>
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
          setValue('');
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
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
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
          {button}
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
  const chatRef = useRef<HTMLDivElement>(null);
  const followChat = useRef(true);
  useEffect(() => {
    if (followChat.current && chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [room.messages.length]);
  const status =
    room.phase === 'ready'
      ? 'The judge sends the opening question.'
      : room.phase === 'opening' || room.phase === 'opening_ai'
        ? 'Opening replies will appear together. Then the minute starts.'
        : room.phase === 'chat'
          ? 'Chat is live.'
          : room.phase === 'verdict'
            ? 'Chat closed. The judge is making the final call.'
            : room.phase === 'waiting'
              ? 'Waiting for your opponent'
              : room.phase === 'complete'
                ? 'The verdict is in'
                : 'Match ended';
  return (
    <div className={'room-page ' + (!done && room.phase !== 'waiting' ? 'active-chat' : '')}>
      <div className="room-topline">
        <button className="text-button" onClick={home}>
          {!done && room.role !== 'spectator' ? 'Leave match' : '← Lobby'}
        </button>
        <span className="eyebrow">MATCH {room.id.slice(0, 6).toUpperCase()}</span>
        {done ? (
          <button className="text-button" onClick={() => copy()}>
            {copied ? 'Copied' : 'Copy replay link'}
          </button>
        ) : null}
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
                : room.phase === 'ready'
                  ? 'Who is human?'
                  : room.phase === 'verdict'
                    ? 'Time is up.'
                    : room.phase === 'opening' || room.phase === 'opening_ai'
                      ? 'Opening replies'
                      : 'Who is human?'}
          </h1>
        </div>
        {room.phase === 'chat' ? <Countdown deadline={room.deadline} /> : null}
      </div>
      {room.phase === 'waiting' ? (
        <div className="waiting-panel">
          <p>
            Share this invitation with your {room.openRole === 'judge' ? 'judge' : 'human opponent'}
            . Both opening replies appear together, then the one-minute chat starts.
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
          <p className="muted">Only the invited player can take the open seat.</p>
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
              “{room.result.reason}”<cite>Reasoning from the judge</cite>
            </blockquote>
          ) : null}
        </section>
      ) : null}
      {room.message ? (
        <div className="ended-panel" role="status">
          {room.message}
        </div>
      ) : null}
      {room.messages.length || (!done && room.phase !== 'waiting') ? (
        <div
          className="chat-transcript"
          ref={chatRef}
          role="log"
          aria-label="Group chat"
          aria-live="polite"
          onScroll={() => {
            const el = chatRef.current!;
            followChat.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {room.messages.map((message) => (
            <article
              className={
                'chat-message ' +
                (message.sender === 'judge' ? 'from-judge ' : '') +
                ((isHuman && message.sender === room.ownLabel) ||
                (isJudge && message.sender === 'judge')
                  ? 'own-message'
                  : '')
              }
              data-sender={message.sender}
              key={message.id}
            >
              <div className="chat-sender">
                <span className="label-square">
                  {message.sender === 'judge' ? 'J' : message.sender}
                </span>
                <span>{message.sender === 'judge' ? 'Judge' : `Contestant ${message.sender}`}</span>
                {room.result && message.sender !== 'judge' ? (
                  <span className="identity">
                    {room.result.humanLabel === message.sender ? 'HUMAN' : 'AI'}
                  </span>
                ) : null}
              </div>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
      ) : null}
      {!done && room.phase !== 'waiting' ? (
        <section className="action-panel" aria-label="Chat controls">
          {(isJudge && room.phase === 'ready') ||
          (isHuman && room.phase === 'opening') ||
          ((isJudge || isHuman) && room.phase === 'chat') ? (
            <Composer
              key={room.phase === 'opening' ? 'opening' : 'chat'}
              label={
                room.phase === 'ready'
                  ? 'Ask the opening question'
                  : room.phase === 'opening'
                    ? 'Write your opening reply'
                    : 'Message the group'
              }
              limit={LIMITS.answer}
              onSubmit={(text) => {
                followChat.current = true;
                send({ type: 'message', text });
              }}
              button={
                room.phase === 'ready'
                  ? 'Ask both contestants'
                  : room.phase === 'opening'
                    ? 'Submit opening reply'
                    : 'Send'
              }
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
              {isHuman && room.ownOpening
                ? 'Your opening reply is locked in. Waiting for both replies.'
                : status}
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
                    disabled={!connected || room.phase === 'verdict'}
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
          {room.role !== 'spectator' ? 'Leaving or disconnecting ends your match.' : ''}
        </p>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
