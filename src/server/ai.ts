import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Label } from '../shared/protocol';
import type { Allowance } from './store';

export const PROMPT_VERSION = 'mbaghadjian-a2bc11a';
export const SYSTEM_PROMPT = readFileSync(new URL('./bot/system.txt', import.meta.url), 'utf8');
export const MODEL = 'anthropic/claude-haiku-4.5';

export type BotState = {
  type: 'state';
  phase: 'opening' | 'live' | 'voting';
  messages: { id: string; from: 'judge' | Label; text: string; ts: number }[];
  startedAt: number | null;
  endsAt: number | null;
};

export type BotCommand =
  | { type: 'message'; role: 'judge' | 'player'; text: string }
  | { type: 'draft'; text: string }
  | { type: 'context'; role: 'judge' | 'player'; name: string; hints?: Record<string, string> };

export type Completion = {
  system: string;
  messages: { role: string; content: string }[];
  max_tokens: number;
};

export interface BotSession {
  send(command: BotCommand): void;
  stop(): void;
}

export interface BotHooks {
  state(state: BotState): void;
  reserve(bound: Allowance): Promise<string>;
  settle(id: string, usage: Allowance | null, metadata: Record<string, unknown>): Promise<void>;
  failed(error: Error): void;
}

export interface AI {
  model: string;
  unavailable?(): string | null;
  start(id: string, humanLabel: Label, hooks: BotHooks): BotSession;
}

export class AIError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Preserve content, token limits and default sampling. Only the wire format changes.
export function openRouterBody(params: Completion) {
  return {
    model: MODEL,
    messages: [{ role: 'system', content: params.system }, ...params.messages],
    max_tokens: params.max_tokens,
    reasoning: { enabled: false },
    provider: { order: ['Anthropic'], allow_fallbacks: false },
  };
}

// Anthropic SDK retry hints and backoff; OpenRouter remains the HTTP transport.
export function retryDelay(headers: Headers, now = Date.now()) {
  const millis = headers.get('retry-after-ms');
  const seconds = headers.get('retry-after');
  const requested =
    millis !== null
      ? Number(millis)
      : seconds !== null
        ? Number.isFinite(Number(seconds))
          ? Number(seconds) * 1000
          : Date.parse(seconds) - now
        : NaN;

  return requested > 0 && requested <= 60_000 ? requested : 500 * (1 - Math.random() * 0.25);
}

export async function requestCompletion(
  params: Completion,
  timeout: number,
  signal: AbortSignal,
  hooks: BotHooks,
  fetcher: typeof fetch = fetch,
) {
  const body = JSON.stringify(openRouterBody(params));
  const bound = { input: Buffer.byteLength(body) + 1024, output: params.max_tokens };

  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();

    const id = await hooks.reserve(bound);
    let status: number | undefined;
    let responseHeaders = new Headers();
    let settled = false;

    try {
      signal.throwIfAborted();

      const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout * 1000)]),
      });

      status = response.status;
      responseHeaders = response.headers;

      if (!response.ok) throw new AIError(`openrouter_${status}`);

      const result = (await response.json()) as {
        id?: string;
        model?: string;
        provider?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const input = result.usage?.prompt_tokens,
        output = result.usage?.completion_tokens;
      const usage =
        Number.isSafeInteger(input) && input! >= 0 && Number.isSafeInteger(output) && output! >= 0
          ? { input: input!, output: output! }
          : null;

      void hooks
        .settle(id, usage, {
          status: 'ok',
          model: result.model ?? MODEL,
          provider: result.provider ?? 'openrouter',
          requestId: result.id,
        })
        .catch((error) =>
          hooks.failed(error instanceof Error ? error : new Error('Usage settlement failed')),
        );

      settled = true;

      const text = result.choices?.[0]?.message?.content;

      if (typeof text !== 'string') throw new AIError('invalid_response');

      return text;
    } catch (error) {
      if (!settled)
        await hooks.settle(id, null, { status: 'failed', code: status ?? 'network_or_cancel' });

      if (
        signal.aborted ||
        attempt ||
        settled ||
        responseHeaders.get('x-should-retry') === 'false' ||
        (responseHeaders.get('x-should-retry') !== 'true' &&
          status &&
          status < 500 &&
          ![408, 409, 429].includes(status))
      )
        throw error;
      // Match the reference Anthropic client's single automatic transport retry.

      const delay = retryDelay(responseHeaders);

      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, delay);

        signal.addEventListener('abort', abort, { once: true });

        if (signal.aborted) abort();
      });
    }
  }

  throw new AIError('request_failed');
}

export function createAI(options: { fetcher?: typeof fetch } = {}): AI {
  return {
    model: MODEL,
    unavailable: () =>
      process.env.OPENROUTER_API_KEY
        ? null
        : 'Set OPENROUTER_API_KEY in .env and restart the server.',
    start(id, humanLabel, hooks) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new AIError('Set OPENROUTER_API_KEY in .env and restart the server.');

      const python = process.env.BOT_PYTHON ?? Bun.which('python3');

      if (!python) throw new AIError('Python 3.9+ is required for the reference bot.');

      const child = Bun.spawn([python, '-u', resolve(import.meta.dir, 'bot/worker.py')], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'ignore',
        env: {
          PATH: process.env.PATH,
          PYTHONDONTWRITEBYTECODE: '1',
          TURING_NEVER_NAME: process.env.TURING_NEVER_NAME,
        },
      });
      let stopped = false;
      const requests = new Map<string, AbortController>();
      const write = (value: unknown) => {
        if (!stopped) child.stdin.write(JSON.stringify(value) + '\n');
      };

      void (async () => {
        try {
          let buffer = '';
          const decoder = new TextDecoder();

          for await (const chunk of child.stdout) {
            buffer += decoder.decode(chunk, { stream: true });

            let end: number;

            while ((end = buffer.indexOf('\n')) >= 0) {
              const event = JSON.parse(buffer.slice(0, end));

              buffer = buffer.slice(end + 1);

              if (stopped) continue;

              if (event.type === 'state') hooks.state(event);

              if (event.type === 'cancel') requests.get(event.id)?.abort();

              if (event.type === 'request') {
                const controller = new AbortController();

                requests.set(event.id, controller);

                void requestCompletion(
                  event.params,
                  event.timeout,
                  controller.signal,
                  hooks,
                  options.fetcher,
                )
                  .then((text) => write({ type: 'result', id: event.id, text }))
                  .catch((error) => {
                    write({ type: 'result', id: event.id, error: 'Provider request failed' });

                    if (
                      !controller.signal.aborted &&
                      error instanceof AIError &&
                      /openrouter_(401|402|403)/.test(error.code)
                    )
                      hooks.failed(error);
                  })
                  .finally(() => requests.delete(event.id));
              }
            }
          }

          if (!stopped) hooks.failed(new AIError('Bot worker exited unexpectedly'));
        } catch {
          if (!stopped) hooks.failed(new AIError('Bot worker transport failed'));
        }
      })();

      write({ type: 'start', id, humanLabel });

      return {
        send: write,
        stop() {
          if (stopped) return;

          stopped = true;

          for (const controller of requests.values()) controller.abort();

          child.kill();
        },
      };
    },
  };
}
