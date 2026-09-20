import type { z } from 'zod';
import type { commandSchema } from './commands';

export const LIMITS = {
  messagesPerPerson: 30,
  answer: 500,
  reason: 1000,
  actionMs: 90_000,
} as const;

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export const characters = (text: string) => [...segmenter.segment(text)].length;

export const shorten = (text: string, max: number) =>
  [...segmenter.segment(text)]
    .slice(0, max)
    .map((s) => s.segment)
    .join('');

export type Command = z.infer<typeof commandSchema>;

export type Role = 'human' | 'judge';

export type QueuePreference = Role | 'either';

export type Label = 'A' | 'B';

export type Phase =
  | 'waiting'
  | 'ready'
  | 'opening'
  | 'opening_ai'
  | 'chat'
  | 'verdict'
  | 'saving'
  | 'complete'
  | 'abandoned'
  | 'failed';

export type ChatMessage = {
  id: string;
  sender: 'judge' | Label;
  text: string;
  sentAt: number;
};

export type RoomView = {
  matchKind: 'public' | 'friend';
  rematch: {
    own: QueuePreference | null;
    other: QueuePreference | null;
    available: boolean;
  } | null;
  id: string;
  phase: Phase;
  messages: ChatMessage[];
  startedAt: number | null;
  createdAt: number;
  deadline: number | null;
  role: Role;
  ownLabel: Label | null;
  ownOpening: string | null;
  judgeName?: string;
  ownName?: string;
  contextReady?: boolean;
  inviteToken?: string;
  openRole: Role | null;
  result: null | {
    humanLabel: Label;
    choice: Label;
    reason: string;
    humanWon: boolean;
  };
  message: string | null;
};

export type Lobby = {
  atCapacity?: boolean;
  score: { completed: number; aiWins: number };
  availability: { available: boolean; message: string | null; resetsAt?: number };
  queued: QueuePreference | null;
};

export type Event =
  | { type: 'lobby'; data: Lobby }
  | { type: 'room'; data: RoomView }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export const ended = (phase: Phase) => ['complete', 'abandoned', 'failed'].includes(phase);

export const normalizeName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}_ \-'.]/gu, '')
    .slice(0, 24)
    .trim();
