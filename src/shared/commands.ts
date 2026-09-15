import { z } from 'zod';
import { LIMITS, characters } from './protocol';

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
  z.object({ type: z.literal('queue'), role: z.enum(['human', 'judge', 'either']) }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('create'), role: z.enum(['human', 'judge', 'either']) }),
  z.object({ type: z.literal('join'), token: z.string().min(20).max(100) }),
  z.object({ type: z.literal('home') }),
  z.object({ type: z.literal('rematch'), role: z.enum(['human', 'judge', 'either']).nullable() }),
  z.object({ type: z.literal('message'), text: text(LIMITS.answer) }),
  z.object({
    type: z.literal('draft'),
    text: z
      .string()
      .max(8000)
      .refine(
        (s) =>
          characters(s) <= LIMITS.answer && new TextEncoder().encode(s).length <= LIMITS.answer * 4,
      ),
  }),
  z.object({
    type: z.literal('verdict'),
    choice: z.enum(['A', 'B']),
    reason: z
      .string()
      .max(8000)
      .refine((s) => characters(s) <= LIMITS.reason)
      .default(''),
  }),
  z.object({ type: z.literal('leave') }),
  z.object({
    type: z.literal('context'),
    name: z.string().max(24),
    hints: z
      .object({
        mobile: z.string().max(40),
        tz: z.string().max(40),
        localTime: z.string().max(40),
        day: z.string().max(40),
        platform: z.string().max(40),
      })
      .optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);
