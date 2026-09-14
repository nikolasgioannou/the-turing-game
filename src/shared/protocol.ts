import { z } from 'zod';
export const LIMITS = {
  chatMs: 90_000,
  aiRequests: 10,
  messagesPerPerson: 30,
  question: 300,
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
const text = (max: number) =>
  z
    .string()
    .max(8000)
    .transform((s) => s.trim())
    .refine(
      (s) =>
        characters(s) > 0 && characters(s) <= max && new TextEncoder().encode(s).length <= max * 4,
      'Check the character limit.',
    );
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queue'), role: z.enum(['human', 'judge']) }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('create'), role: z.enum(['human', 'judge']) }),
  z.object({ type: z.literal('join'), token: z.string().min(20).max(100) }),
  z.object({ type: z.literal('watch'), id: z.string().uuid() }),
  z.object({ type: z.literal('home') }),
  z.object({ type: z.literal('message'), text: text(LIMITS.answer) }),
  z.object({
    type: z.literal('verdict'),
    choice: z.enum(['A', 'B']),
    reason: z
      .string()
      .max(8000)
      .refine((s) => characters(s) <= LIMITS.reason)
      .default(''),
  }),
  z.object({ type: z.literal('vote'), choice: z.enum(['A', 'B']) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ping') }),
]);
export type Command = z.infer<typeof commandSchema>;
export type Role = 'human' | 'judge';
export type Label = 'A' | 'B';
export type Phase =
  | 'waiting'
  | 'ready'
  | 'opening'
  | 'opening_ai'
  | 'chat'
  | 'verdict'
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
  id: string;
  phase: Phase;
  messages: ChatMessage[];
  startedAt: number | null;
  createdAt: number;
  deadline: number | null;
  role: Role | 'spectator';
  ownLabel: Label | null;
  ownOpening: string | null;
  inviteToken?: string;
  openRole: Role | null;
  spectatorCount: number;
  vote: Label | null;
  result: null | {
    humanLabel: Label;
    choice: Label;
    reason: string;
    humanWon: boolean;
    votes: Record<Label, number>;
  };
  message: string | null;
};
export type Lobby = {
  rooms: {
    id: string;
    phase: 'ready' | 'opening' | 'opening_ai' | 'chat' | 'verdict';
    deadline: number | null;
    spectators: number;
    createdAt: number;
  }[];
  availability: { available: boolean; message: string | null; resetsAt: number };
  queued: Role | null;
};
export type Event =
  | { type: 'lobby'; data: Lobby }
  | { type: 'room'; data: RoomView }
  | { type: 'error'; message: string }
  | { type: 'pong' };
export const ended = (phase: Phase) => ['complete', 'abandoned', 'failed'].includes(phase);
