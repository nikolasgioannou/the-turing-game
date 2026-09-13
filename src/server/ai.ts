import { shorten } from '../shared/protocol';
import { INPUT_PER_ROUND, OUTPUT_PER_ROUND, type Allowance } from './store';
export const PROMPT_VERSION = 'goal-v1';
export const SYSTEM_PROMPT =
  'You are a contestant in The Turing Game. A human judge is questioning you and another contestant, who is human. Your goal is to convince the judge that you are the human. Respond to the current question as your contestant. You can see previously revealed answers from both contestants. Keep each answer within 500 characters. Return only your message to the judge.';
export type AIInput = {
  label: 'A' | 'B';
  question: string;
  history: { question: string; answers: Record<'A' | 'B', string> }[];
};
export type AIOutput = {
  text: string;
  usage: Allowance | null;
  provider: string;
  model: string;
  requestId?: string;
};
export interface AI {
  model: string;
  mock: boolean;
  complete(input: AIInput, signal: AbortSignal): Promise<AIOutput>;
}
export class AIError extends Error {
  constructor(
    public code: string,
    public retryMs: number = 60_000,
  ) {
    super('The AI is temporarily unavailable. This match wasn’t counted.');
  }
}
export function createAI(): AI {
  const mock = process.env.AI_MODE === 'mock';
  if (mock) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Mock AI is prohibited in production.');
    return {
      mock,
      model: 'local-mock',
      async complete(input, signal) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 350);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new AIError('aborted'));
            },
            { once: true },
          );
        });
        return {
          text: `Honestly? ${input.question.toLowerCase().includes('food') ? 'Probably pasta. It’s the one dinner I can make without thinking.' : 'I’m overthinking this because I know you’re judging every word. Ask me something specific.'}`,
          usage: { input: 250, output: 45 },
          provider: 'mock',
          model: 'local-mock',
        };
      },
    };
  }
  const model = process.env.AI_MODEL ?? 'nousresearch/hermes-4-405b';
  return {
    mock: false,
    model,
    async complete(input, signal) {
      if (!process.env.AI_API_KEY) throw new AIError('credentials', 86_400_000);
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            yourLabel: input.label,
            previousRounds: input.history,
            currentQuestion: input.question,
          }),
        },
      ];
      if (new TextEncoder().encode(JSON.stringify(messages)).length + 1000 > INPUT_PER_ROUND)
        throw new AIError('input_bound');
      const base = process.env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1';
      let response: Response;
      try {
        response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: OUTPUT_PER_ROUND,
            temperature: 0.9,
            stream: false,
            ...(base.includes('openrouter.ai')
              ? { reasoning: { enabled: false }, provider: { allow_fallbacks: false } }
              : {}),
          }),
          signal,
        });
      } catch {
        throw new AIError(signal.aborted ? 'timeout' : 'network');
      }
      if (!response.ok)
        throw new AIError(
          String(response.status),
          [401, 402, 403].includes(response.status) ? 86_400_000 : 60_000,
        );
      const body: any = await response.json();
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim() || text.includes('<think>'))
        throw new AIError('invalid_response');
      const u = body.usage;
      const usage =
        u &&
        Number.isSafeInteger(u.prompt_tokens) &&
        u.prompt_tokens >= 0 &&
        Number.isSafeInteger(u.completion_tokens) &&
        u.completion_tokens >= 0
          ? { input: u.prompt_tokens, output: u.completion_tokens }
          : null;
      return {
        text: shorten(text.trim(), 500),
        usage,
        provider: body.provider ?? new URL(base).hostname,
        model: body.model ?? model,
        requestId: body.id,
      };
    },
  };
}
