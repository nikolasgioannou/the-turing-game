import { copyText } from './clipboard';
import { Music } from './music';
import { CreatorCredits, LiveScore } from './home-details';
import { HowToPlay } from './how-to-play';
import { AppShell, RoomTitle, MatchToolbar } from './ui/layout';
import {
  Button,
  ChoiceButton,
  RoleButton,
  SegmentButton,
  Dialog,
  Input,
  Textarea,
  Panel,
} from './ui';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  characters,
  normalizeName,
  shorten,
  ended,
  LIMITS,
  type Command,
  type Event,
  type Label,
  type Lobby,
  type RoomView,
} from '../shared/protocol';
import './styles.css';
import { ChatMessageItem } from './chat-message';
import { MatchResult } from './match-result';

const pathCommand = (): Command | null => {
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
    [startOpen, setStartOpen] = useState(false),
    [instructionsOpen, setInstructionsOpen] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const initial = useRef(pathCommand());
  const dismissedRoom = useRef<string | null>(null);
  const send = (command: Command) => {
    setError(null);

    if (ws.current?.readyState !== WebSocket.OPEN) {
      setError('Connection lost. Reconnecting to your match…');

      return;
    }

    ws.current.send(JSON.stringify(command));
  };

  // Operator shortcut: Cmd/Ctrl + Shift + "+" opens the simulator (404 unless the server has it enabled).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        (event.key === '+' || event.key === '=')
      ) {
        event.preventDefault();
        window.location.assign('/sim');
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | undefined;
    let heartbeat: ReturnType<typeof setInterval>;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;

    function reconnect() {
      if (stopped) return;

      clearTimeout(retry);
      retry = setTimeout(() => void start(), Math.min(1000 * 2 ** attempts++, 10000));
    }

    async function start() {
      try {
        const response = await fetch('/api/session', { signal: AbortSignal.timeout(10000) });

        if (!response.ok) throw new Error('Session unavailable');

        if (stopped) return;

        socket = new WebSocket(
          `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
        );

        ws.current = socket;

        socket.onopen = () => {
          if (stopped) return;

          attempts = 0;
          setConnected(true);
          setError(null);

          heartbeat = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ type: 'ping' }));
          }, 15_000);

          const restore = initial.current ?? pathCommand();

          if (restore) {
            socket!.send(JSON.stringify(restore));
            initial.current = null;
          }
        };

        socket.onmessage = (e) => {
          if (stopped) return;

          const event: Event = JSON.parse(e.data);

          if (event.type === 'lobby') {
            setLobby(event.data);
            setJoining(false);
          } else if (event.type === 'room') {
            if (event.data.id === dismissedRoom.current) return;

            setRoom(event.data);
            setStartOpen(event.data.phase === 'waiting');
            setJoining(false);

            history.replaceState(null, '', '/');
          } else if (event.type === 'error') {
            setError(event.message);
            setStartOpen(false);
            setJoining(false);
          }
        };

        socket.onclose = () => {
          clearInterval(heartbeat);

          if (stopped) return;

          setConnected(false);
          setError('Connection lost. Reconnecting to your match…');
          reconnect();
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        if (stopped) return;

        setConnected(false);
        setError('Unable to reach the game. Retrying…');
        reconnect();
      }
    }

    void start();

    return () => {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  const home = () => {
    if (room && !ended(room.phase)) {
      if (!confirm('Leave this match? It will end for both players.')) return;

      dismissedRoom.current = room.id;
      send({ type: 'leave' });
    } else send({ type: 'home' });

    setRoom(null);
    history.replaceState(null, '', '/');
  };
  const play = (role: 'human' | 'judge' | 'either', invite = false) => {
    setJoining(true);
    setInviteRole(false);

    send({ type: invite ? 'create' : 'queue', role });
  };
  const waitingInvite = room?.phase === 'waiting';
  const cancelInvite = (close = false) => {
    if (room) dismissedRoom.current = room.id;

    send({ type: 'leave' });
    setRoom(null);
    setStartOpen(!close);
    setInviteRole(true);
    setJoining(false);
    history.replaceState(null, '', '/');
  };

  return (
    <AppShell>
      <Music />
      {error ? (
        <div
          role="alert"
          className="error-banner mt-5 flex justify-between gap-5 rounded-none border border-[#f17b49] bg-[#351c17] p-4 text-[15px] leading-[1.6] text-[#ffcfaf] [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-inherit [&_button]:underline"
        >
          {error}
          {!connected ? (
            <button onClick={() => location.reload()}>Retry now</button>
          ) : (
            <button aria-label="Dismiss error" onClick={() => setError(null)}>
              ×
            </button>
          )}
        </div>
      ) : null}
      <main className="pt-6 max-[640px]:pt-4 [.app-shell:has(.active-chat)_&]:min-h-0 [.app-shell:has(.active-chat)_&]:flex-1 [.app-shell:has(.arcade-lobby)_&]:flex [.app-shell:has(.arcade-lobby)_&]:flex-1 [.app-shell:has(.arcade-lobby)_&]:flex-col [.app-shell:has(.arcade-lobby)_&]:justify-center [.app-shell:has(.arcade-lobby)_&]:py-6">
        {room && !waitingInvite ? (
          <Room key={room.id} room={room} send={send} home={home} connected={connected} />
        ) : (
          <>
            <section className="arcade-lobby">
              <div className="cabinet-top flex justify-between gap-3 text-[10px] tracking-[2px] text-[#8aafb9] max-[640px]:text-[8px] max-[640px]:tracking-normal">
                <span>HUMAN VS MACHINE</span>
                <span>90 SECOND SHOWDOWN</span>
              </div>
              <h1 className="arcade-logo">
                <span>THE</span>TURING GAME
              </h1>
              <p className="arcade-tagline">One human. One AI. Find the bot.</p>
              <div className="lobby-actions mt-0 flex flex-col items-center justify-center gap-2.5">
                <Button
                  variant="arcade"
                  size="arcade"
                  aria-label="Start game"
                  disabled={
                    !connected || joining || !!lobby?.queued || !lobby?.availability.available
                  }
                  onClick={() => setStartOpen(true)}
                >
                  Start game
                </Button>
                <Button variant="ghost" size="text" onClick={() => setInstructionsOpen(true)}>
                  How to play
                </Button>
              </div>
              {lobby && !lobby.availability.available ? (
                <p
                  className="capacity rounded-[5px] border border-[#735742] bg-[#30261f] p-4 text-[15px] leading-[1.6] text-[#f6d7b9]"
                  role="status"
                >
                  {lobby.availability.message}
                </p>
              ) : null}
              <LiveScore score={lobby?.score} connected={connected} />
              <ArcadeStage />
            </section>
            {instructionsOpen ? <HowToPlay onClose={() => setInstructionsOpen(false)} /> : null}
            {startOpen ? (
              <Dialog
                label="Start a game"
                onClose={() => {
                  if (waitingInvite) {
                    cancelInvite(true);

                    return;
                  }

                  if (joining || lobby?.queued) send({ type: 'cancel' });

                  setJoining(false);
                  setStartOpen(false);
                  setInviteRole(false);
                }}
              >
                {waitingInvite && room ? (
                  <InviteWaiting room={room} cancel={() => cancelInvite()} />
                ) : joining || lobby?.queued ? (
                  <>
                    <p className="eyebrow">MATCHMAKING</p>
                    <h2>Finding an opponent</h2>
                    <div
                      className="compact-queue m-0 flex min-h-12.5 items-center gap-3 border border-player-b bg-[#152125] px-4 py-3.5 text-[13px] text-[#ccecf6]"
                      role="status"
                    >
                      <span className="waiting-mark size-3.75 shrink-0 animate-[spin_1.5s_linear_infinite] rounded-full border-2 border-[#59604e] border-t-[#77def2]" />
                      {lobby?.queued
                        ? lobby.queued === 'either'
                          ? 'Finding a match for either role…'
                          : `Finding a ${lobby.queued === 'human' ? 'judge' : 'human'}…`
                        : 'Joining…'}
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-5"
                      onClick={() => {
                        send({ type: 'cancel' });
                        setJoining(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <h2>Choose your role</h2>
                    <div
                      className="dialog-modes flex rounded-none border border-[#39484e] bg-[#080d10] p-1"
                      aria-label="Game type"
                    >
                      <SegmentButton
                        aria-pressed={!inviteRole}
                        onClick={() => setInviteRole(false)}
                      >
                        Find a match
                      </SegmentButton>
                      <SegmentButton aria-pressed={inviteRole} onClick={() => setInviteRole(true)}>
                        Invite a friend
                      </SegmentButton>
                    </div>
                    <div className="dialog-roles mt-4 grid gap-2.5">
                      <RoleButton
                        tone="a"
                        title="Play as human"
                        disabled={!connected || joining || !lobby?.availability.available}
                        onClick={() => play('human', inviteRole)}
                      >
                        Avoid being mistaken for AI.
                      </RoleButton>
                      <RoleButton
                        tone="b"
                        title="Play as judge"
                        disabled={!connected || joining || !lobby?.availability.available}
                        onClick={() => play('judge', inviteRole)}
                      >
                        Find the bot.
                      </RoleButton>
                      <RoleButton
                        tone="neutral"
                        title="Either role"
                        disabled={!connected || joining || !lobby?.availability.available}
                        onClick={() => play('either', inviteRole)}
                      >
                        {inviteRole
                          ? 'We’ll randomly assign you and your friend a role.'
                          : 'No preference. Fill whichever role is needed.'}
                      </RoleButton>
                    </div>
                  </>
                )}
              </Dialog>
            ) : null}
            <CreatorCredits />
          </>
        )}
      </main>
    </AppShell>
  );
}

function InviteWaiting({ room, cancel }: { room: RoomView; cancel: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/#invite=${room.inviteToken}`;

  return (
    <div className="invite-waiting">
      <p className="eyebrow">INVITE A FRIEND</p>
      <h2>Invite your opponent</h2>
      <p className="muted">
        Share this link with your {room.openRole === 'judge' ? 'judge' : 'human opponent'}.
      </p>
      <Input
        className="my-4 w-full min-w-0 p-3 text-[13px]"
        aria-label="Invitation link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="invite-actions mb-5 flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={async () => {
            try {
              await copyText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy invitation'}
        </Button>
        <Button variant="secondary" onClick={cancel}>
          Cancel
        </Button>
      </div>
      <p className="muted" role="status">
        Waiting for your opponent to join…
      </p>
    </div>
  );
}

function ArcadeStage() {
  return (
    <div
      className="arcade-stage mx-auto mt-6.5 max-w-160 max-[640px]:mt-8.75"
      aria-label="Two contestants face a judge. Identify the bot."
    >
      <svg
        className="block h-auto w-full"
        viewBox="0 0 640 250"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
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
      <div className="stage-labels grid grid-cols-3 py-2.5 font-arcade text-xs text-[#ff8b46] max-[640px]:text-[9px]">
        <span>A</span>
        <span className="text-[#ffc56b]">JUDGE</span>
        <span className="text-player-b">B</span>
      </div>
      <p className="mt-2.5 mb-4 text-xs tracking-[2px] text-[#96aab0] uppercase max-[640px]:text-[10px] max-[640px]:tracking-normal">
        Real people? Machines? You decide.
      </p>
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
      className={`timer border-0 p-0 font-arcade text-[32px] font-bold tracking-[-0.025em] tabular-nums text-shadow-[2px_3px_#692e1c] max-[640px]:text-[23px] ${seconds < 20 ? 'bg-[#33243a] text-[#ffc88e]' : 'bg-transparent text-player-a'}`}
      role="timer"
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
  onDraft,
  button,
  sendBlocked = false,
}: {
  label: string;
  limit: number;
  onSubmit: (text: string) => void;
  onDraft?: (text: string) => void;
  button: string;
  sendBlocked?: boolean;
}) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const draftCallback = useRef(onDraft);

  draftCallback.current = onDraft;

  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(draftTimer.current), []);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const count = characters(value);
  const nearLimit = count >= limit - 50;

  return (
    <form
      className="composer grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-2 [&_label]:sr-only"
      onSubmit={(e) => {
        e.preventDefault();

        if (!sendBlocked && value.trim() && count <= limit) {
          onSubmit(value);
          setValue('');
          clearTimeout(draftTimer.current);
          draftCallback.current?.('');
        }
      }}
    >
      <label htmlFor="message">{label}</label>
      <Textarea
        className="block h-12 max-h-30 min-h-12 w-full resize-none px-3.5 py-2.75 text-base leading-6 placeholder:text-[#8993b4]"
        ref={input}
        id="message"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          clearTimeout(draftTimer.current);

          if (draftCallback.current)
            draftTimer.current = setTimeout(
              () => draftCallback.current?.(shorten(input.current?.value ?? '', limit)),
              120,
            );
        }}
        placeholder={label}
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();

            if (!sendBlocked) e.currentTarget.form?.requestSubmit();
          }
        }}
        aria-describedby={
          [nearLimit ? 'character-count' : '', onDraft ? 'draft-note' : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        maxLength={8000}
      />
      <div className="composer-bottom contents text-[10px]">
        {nearLimit || onDraft ? (
          <div className="col-span-full row-start-2 flex flex-wrap justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
            {onDraft ? <span id="draft-note">Draft shared privately with AI</span> : null}
            {nearLimit ? (
              <span
                id="character-count"
                className={count > limit ? 'ml-auto text-[#ffab9c]' : 'ml-auto text-[#e6c784]'}
              >
                {count > limit
                  ? `${count - limit} characters over limit`
                  : `${limit - count} characters remaining`}
              </span>
            ) : null}
          </div>
        ) : null}
        <Button
          type="submit"
          className="col-start-2 row-start-1 w-auto uppercase"
          size="composer"
          variant="primary"
          disabled={sendBlocked || !value.trim() || count > limit}
        >
          {button}
        </Button>
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
    [guessing, setGuessing] = useState(false),
    [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ended(room.phase)) window.scrollTo({ top: 0 });
  }, [room.phase]);

  const done = ended(room.phase),
    isJudge = room.role === 'judge',
    isHuman = room.role === 'human';
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('tg_name') ?? '';
    } catch {
      return '';
    }
  });
  const contextPhase = ['ready', 'opening', 'opening_ai', 'chat'].includes(room.phase);
  const needsName = (isJudge || isHuman) && contextPhase && !room.ownName;
  const contextSent = useRef(false);

  useEffect(() => {
    if (!connected) {
      contextSent.current = false;

      return;
    }

    if (!room.ownName || contextSent.current || !contextPhase || (!isJudge && !isHuman)) return;

    contextSent.current = true;
    send({ type: 'context', name: room.ownName, ...(isHuman ? { hints: deviceHints() } : {}) });
  }, [connected, room.ownName, contextPhase, isJudge, isHuman]);

  const copy = async () => {
    try {
      await copyText(`${location.origin}/#invite=${room.inviteToken}`);

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

  const showVerdict = isJudge && (room.phase === 'verdict' || (room.phase === 'chat' && guessing));

  const canSend =
    connected &&
    room.contextReady !== false &&
    !guessing &&
    (room.phase === 'chat' ||
      (isJudge && ['ready', 'opening', 'opening_ai'].includes(room.phase)) ||
      (isHuman && ['opening', 'opening_ai'].includes(room.phase)));
  const status = !connected
    ? 'Reconnecting — your draft stays here.'
    : room.contextReady === false
      ? 'Waiting for both players to enter their names.'
      : room.phase === 'ready'
        ? isJudge
          ? 'Ask a question to start.'
          : 'Waiting for the judge to ask a question.'
        : room.phase === 'opening'
          ? isHuman
            ? 'Your turn — answer the opening question.'
            : null
          : room.phase === 'opening_ai'
            ? 'Opening replies are being prepared. You can keep chatting.'
            : room.phase === 'verdict'
              ? isJudge
                ? 'Choose who is the bot to finish the match.'
                : 'Waiting for the judge to choose.'
              : guessing
                ? 'Choose who is the bot, or go back to chat.'
                : room.phase === 'chat'
                  ? isJudge
                    ? 'Ask questions or make a guess anytime.'
                    : 'Chat with the group. Avoid being mistaken for AI.'
                  : 'Waiting for your opponent.';

  return (
    <div
      className={
        'room-page group/room ' +
        (!done && room.phase !== 'waiting'
          ? 'active-chat flex h-full min-h-0 flex-col pt-2 pb-[max(8px,env(safe-area-inset-bottom,0px))]'
          : 'pt-7 pb-[calc(48px+env(safe-area-inset-bottom,0px))]') +
        (room.phase === 'verdict' || guessing ? ' verdict-chat' : '')
      }
    >
      {needsName ? (
        <Dialog label="Your first name" onClose={home}>
          <h2 className="mb-4 font-arcade text-lg text-ink">{isJudge ? 'Judge' : 'Player'}</h2>
          <p className="mb-5 text-sm text-muted">
            {isJudge
              ? 'First name. The players will talk to you like a person.'
              : 'First name. The judge sees what you type, not this.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();

              if (!normalizeName(name)) return;

              try {
                localStorage.setItem('tg_name', name.trim());
              } catch {}

              contextSent.current = true;

              send({
                type: 'context',
                name: normalizeName(name),
                ...(isHuman ? { hints: deviceHints() } : {}),
              });
            }}
            className="flex flex-col gap-4"
          >
            <label htmlFor="first-name" className="text-sm">
              First name
            </label>
            <Input
              id="first-name"
              autoComplete="given-name"
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="p-3"
              required
            />
            <Button type="submit" disabled={!connected || !normalizeName(name)}>
              Enter
            </Button>
          </form>
        </Dialog>
      ) : null}
      {done ? (
        room.result ? (
          <MatchResult result={room.result} role={room.role} />
        ) : (
          <RoomTitle>
            <h1>Match ended.</h1>
          </RoomTitle>
        )
      ) : (
        <MatchToolbar
          identity={
            isHuman ? (
              <span aria-label="Your contestant" className="sr-only">
                Contestant {room.ownLabel}
              </span>
            ) : null
          }
          action={
            isJudge && room.phase === 'chat' && !guessing ? (
              <Button
                variant="secondary"
                size="compact"
                className="px-3 text-xs max-[400px]:px-2 max-[400px]:text-[11px]"
                disabled={!connected}
                onClick={() => setGuessing(true)}
              >
                Make a guess
              </Button>
            ) : null
          }
        >
          {room.phase === 'chat' ? <Countdown deadline={room.deadline} /> : null}
        </MatchToolbar>
      )}
      {room.phase === 'waiting' ? (
        <Panel className="waiting-panel [&_.muted]:mb-0 [&_.muted]:text-sm [&_input]:mt-2.5 [&_input]:mb-5 [&_input]:w-full [&_input]:p-3 [&_p]:leading-[1.6]">
          <p>
            Share this invitation with your {room.openRole === 'judge' ? 'judge' : 'human opponent'}
            . Both opening replies appear together, then the 90-second chat starts.
          </p>
          {room.inviteToken ? (
            <>
              <Input
                aria-label="Invitation link"
                readOnly
                value={`${location.origin}/#invite=${room.inviteToken}`}
              />
              <Button variant="primary" onClick={() => copy()}>
                {copied ? 'Copied' : 'Copy invitation'}
              </Button>
            </>
          ) : (
            <p>Waiting for the invited player.</p>
          )}
          <p className="muted">Only the invited player can take the open seat.</p>
        </Panel>
      ) : null}

      {room.message ? (
        <Panel
          className="ended-panel mb-6.5 text-[15px] leading-[1.6] text-[#f6d7b9]"
          role="status"
        >
          {room.message}
        </Panel>
      ) : null}
      {room.messages.length || (!done && room.phase !== 'waiting') ? (
        <div
          className={`chat-transcript flex flex-col gap-3 overscroll-none px-1 py-4 ${done ? 'mb-5 overflow-visible' : 'm-0 min-h-0 flex-1 overflow-y-auto'}`}
          ref={chatRef}
          role="log"
          aria-label="Group chat"
          aria-live="polite"
          onScroll={() => {
            const el = chatRef.current!;

            followChat.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {!room.messages.length ? (
            <div className="m-auto max-w-md px-4 py-8 text-center text-sm leading-relaxed text-muted">
              <h2 className="mb-4 text-lg font-bold text-ink">
                {isJudge ? 'Find the bot' : 'Blend in. Stay human.'}
              </h2>
              <p className="mb-3">
                {isJudge
                  ? 'Ask both contestants a question. One is human, one is AI.'
                  : 'The judge will ask a question. Send your answer when it arrives.'}
              </p>
              <p>
                Both opening replies appear together, then the 90-second chat starts. The judge can
                guess anytime during chat.
              </p>
            </div>
          ) : null}
          {room.messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              revealedIdentity={
                room.result && message.sender !== 'judge'
                  ? message.sender === room.result.humanLabel
                    ? 'human'
                    : 'bot'
                  : undefined
              }
              own={
                (isHuman && message.sender === room.ownLabel) ||
                (isJudge && message.sender === 'judge')
              }
            />
          ))}
        </div>
      ) : null}
      {!done && room.phase !== 'waiting' ? (
        <section
          className="action-panel m-0 shrink-0 border-0 border-t border-[#303853] bg-transparent py-3"
          aria-label="Chat controls"
        >
          {status && !showVerdict ? (
            <p
              className={
                room.phase === 'chat' && canSend
                  ? 'sr-only'
                  : 'mb-2 text-xs leading-normal text-muted'
              }
              role="status"
            >
              {room.judgeName && isHuman ? `Judge: ${room.judgeName}. ` : ''}
              {status}
            </p>
          ) : null}
          {isJudge || isHuman ? (
            <div hidden={showVerdict}>
              <Composer
                label="Message the group"
                button="Send"
                limit={LIMITS.answer}
                onSubmit={(text) => {
                  followChat.current = true;
                  send({ type: 'message', text });
                }}
                onDraft={
                  isHuman && ['opening', 'opening_ai', 'chat'].includes(room.phase)
                    ? (text) => send({ type: 'draft', text })
                    : undefined
                }
                sendBlocked={!canSend}
              />
            </div>
          ) : null}
          {showVerdict ? (
            <form
              className="verdict-form [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-medium [&_label]:mb-1.5 [&_label]:block [&_label]:text-[13px] [&_textarea]:block [&_textarea]:h-16 [&_textarea]:min-h-16 [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-base [&_textarea]:leading-[1.6]"
              onSubmit={(e) => {
                e.preventDefault();

                if (choice) send({ type: 'verdict', choice, reason });
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2>Who is the bot?</h2>
                {room.phase === 'chat' ? (
                  <Button variant="ghost" size="text" onClick={() => setGuessing(false)}>
                    Back to chat
                  </Button>
                ) : null}
              </div>
              {room.phase === 'chat' ? (
                <p className="mb-3 text-xs text-muted">
                  Submitting ends the chat and reveals both contestants.
                </p>
              ) : null}
              <div className="choice-row flex flex-wrap gap-2.5 group-[.verdict-chat]/room:mb-3.5">
                {(['A', 'B'] as Label[]).map((label) => (
                  <ChoiceButton
                    compact
                    tone={label === 'A' ? 'a' : 'b'}
                    aria-pressed={choice === label}
                    onClick={() => setChoice(label)}
                    key={label}
                  >
                    Contestant {label}
                  </ChoiceButton>
                ))}
              </div>
              <label htmlFor="reason">
                What gave them away? <span className="muted">(optional)</span>
              </label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={8000}
              />
              <div className="composer-bottom mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-[11px]">
                {characters(reason) >= LIMITS.reason - 50 ? (
                  <span className={characters(reason) > LIMITS.reason ? 'over-limit' : 'muted'}>
                    {LIMITS.reason - characters(reason)} characters remaining
                  </span>
                ) : null}
                <Button
                  type="submit"
                  size="compact"
                  variant="primary"
                  disabled={!choice || !connected || characters(reason) > LIMITS.reason}
                >
                  Submit verdict & reveal
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
      {done ? (
        <div className="postgame mt-7.5 flex items-center gap-5.5 text-sm max-[700px]:flex-col max-[700px]:items-start">
          <Button variant="primary" onClick={home}>
            Back to lobby ↗
          </Button>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Browser context for conversation hints; never used as identity.
function deviceHints() {
  const ua = navigator.userAgent || '';
  let tz = '';

  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {}

  const d = new Date();

  return {
    mobile: String(/iPhone|Android|iPad|Mobile/i.test(ua)),
    tz,
    localTime: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    day: d.toLocaleDateString([], { weekday: 'long' }),
    platform: /iPhone/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? 'Android phone'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows PC'
            : 'computer',
  };
}
