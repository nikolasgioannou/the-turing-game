import { characters, type ChatMessage, type Label } from '../shared/protocol';

export type TypingDraft = {
  text: string;
  peerId: string;
  expires: number;
  changedAt: number;
  startedAt: number;
  revision: number;
  judgeId?: string;
};

export type Opportunity = {
  key: string;
  target: 'judge' | 'opponent';
  evidence: 'draft' | 'sent' | 'direct';
  readyAt: number;
  draft?: TypingDraft;
};

// Routing is based on who is being addressed, not on a list of question topics.
function addresses(text: string, label: Label, allowPronouns = false) {
  return (
    new RegExp(
      `(?:^|[,;]\\s*)(?:contestant\\s+|@)?${label}(?=[:?,!]|\\s+(?:what|why|how|where|when|who|are|is|do|did|can|could|would|will|have|tell|prove|explain)\\b)`,
    ).test(text) ||
    (allowPronouns && /\b(?:bot|ai)\b/i.test(text)) ||
    (allowPronouns &&
      /\b(?:you|your|u|ur)\b/i.test(text) &&
      /\?|^(?:why|what|how|are|do|did|can|stop)\b/i.test(text))
  );
}

export function conversationOpportunity(
  messages: ChatMessage[],
  human: Label,
  draft: TypingDraft | undefined,
  now: number,
): Opportunity | null {
  const ai = human === 'A' ? 'B' : 'A';
  const judge = [...messages].reverse().find((message) => message.sender === 'judge');
  const judgeIndex = judge ? messages.indexOf(judge) : -1;
  const sinceJudge = messages.slice(judgeIndex + 1);
  const answered = sinceJudge.some(
    (message) => message.sender === ai && (!message.replyTo || message.replyTo === judge?.id),
  );
  const latest = messages.at(-1);

  if (!latest) return null;

  if (judge && !answered) {
    if (addresses(judge.text, human) && !addresses(judge.text, ai)) return null;

    const response = [...sinceJudge].reverse().find((message) => message.sender === human);

    if (response)
      return { key: judge.id, target: 'judge', evidence: 'sent', readyAt: response.sentAt + 650 };

    if (
      draft &&
      draft.expires > now &&
      draft.judgeId === judge.id &&
      characters(draft.text.trim()) >= 3
    ) {
      return {
        key: judge.id,
        target: 'judge',
        evidence: 'draft',
        readyAt: draft.changedAt + 800,
        draft,
      };
    }
    // A direct question to the AI need not wait for the other contestant.

    if (addresses(judge.text, ai))
      return { key: judge.id, target: 'judge', evidence: 'direct', readyAt: judge.sentAt + 1200 };

    return null;
  }

  // A parallel answer to the judge is not a message to the AI. Only a clear
  // peer-directed turn creates a separate opportunity after our own answer.
  if (latest.sender === human && addresses(latest.text, ai, true)) {
    return { key: latest.id, target: 'opponent', evidence: 'direct', readyAt: latest.sentAt + 900 };
  }

  return null;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)];
};

export function humanCadence(messages: ChatMessage[], human: Label, typingRates: number[] = []) {
  const delays: number[] = [];
  let question: ChatMessage | undefined;

  for (const message of messages) {
    if (message.sender === 'judge') question = message;
    else if (message.sender === human && question) {
      const delay = message.sentAt - question.sentAt;

      if (delay > 250 && delay < 60_000) delays.push(delay);

      question = undefined;
    }
  }

  return { responseMs: median(delays.slice(-6)), charsPerSecond: median(typingRates.slice(-6)) };
}
