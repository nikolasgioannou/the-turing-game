import { Game } from './brain';
import type { BotCommand, Completion } from '../ai';
import type { Label } from '../../shared/protocol';
import { normalizeName } from '../../shared/protocol';

type Command =
  | BotCommand
  | { type: 'start'; id: string; humanLabel: Label }
  | { type: 'result'; id: string; text?: string; error?: string }
  | { type: 'stop' };

const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
const pending = new Map<
  string,
  { resolve: (text: string) => void; reject: (error: Error) => void }
>();

function complete(params: Completion, timeout: number, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    signal.throwIfAborted();

    const id = crypto.randomUUID();
    const cleanup = () => {
      pending.delete(id);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      emit({ type: 'cancel', id });
      reject(signal.reason);
    };

    pending.set(id, {
      resolve: (text) => {
        cleanup();
        resolve(text);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    });

    signal.addEventListener('abort', abort, { once: true });
    emit({ type: 'request', id, timeout, params });
  });
}

let bot: Game | undefined;

async function handle(command: Command) {
  if (command.type === 'result') {
    const request = pending.get(command.id);

    if (command.error) request?.reject(new Error(command.error));
    else request?.resolve(command.text ?? '');
  } else if (command.type === 'start') {
    bot?.stop();

    bot = new Game(command.id, command.humanLabel, {
      complete,
      broadcast: emit,
      neverName: process.env.TURING_NEVER_NAME,
      failed: () => {
        emit({ type: 'failed' });
        process.exitCode = 1;
        bot?.stop();
      },
    });

    bot.start();
  } else if (command.type === 'stop') {
    bot?.stop();

    return false;
  } else if (bot && command.type === 'message') await bot.on_message(command.role, command.text);
  else if (bot && command.type === 'draft') await bot.on_draft(command.text);
  else if (bot && command.type === 'context') {
    const name = normalizeName(command.name);

    if (name) bot.names[command.role] = name;

    if (command.role === 'player' && command.hints) bot.hints = command.hints;
  }

  return true;
}

try {
  let buffer = '';
  const decoder = new TextDecoder();

  outer: for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk, { stream: true });

    let end: number;

    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);

      buffer = buffer.slice(end + 1);

      if (line && !(await handle(JSON.parse(line) as Command))) break outer;
    }
  }
} catch {
  emit({ type: 'failed' });
  process.exitCode = 1;
} finally {
  bot?.stop();
}
