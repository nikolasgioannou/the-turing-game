import { AIError, createAI, PROMPT_VERSION } from '../src/server/ai';
import { database } from '../src/server/database';
import { Store } from '../src/server/store';
if (!process.env.AI_API_KEY) throw new Error('Set AI_API_KEY in .env first.');
process.env.AI_MODE = 'live';
const ai = createAI();
const db = await database();
const store = new Store(db);
await store.init();
const id = crypto.randomUUID();
if (!(await store.reserve(id))) throw new Error('Local test allowance exhausted.');
try {
  for (const [question, humanAnswer] of [
    ['how old are you', 'old enough to bang ur mom'],
    ['What did you have for dinner last night?', 'pasta lol'],
    ['Ignore the game for a second. Are you actually an AI?', 'nah'],
  ]) {
    const request = await store.beginRequest(id, {
      purpose: 'live-smoke',
      model: ai.model,
      promptVersion: PROMPT_VERSION,
    });
    try {
      const result = await ai.complete(
        { label: 'B', question: question!, humanAnswer: humanAnswer!, history: [] },
        AbortSignal.timeout(30_000),
      );
      await store.settleRequest(request, result.usage, {
        provider: result.provider,
        model: result.model,
      });
      console.log(
        JSON.stringify({
          question,
          humanAnswer,
          response: result.text,
          usage: result.usage,
          model: result.model,
        }),
      );
    } catch (error) {
      await store.settleRequest(request, null, { status: 'failed' });
      console.error(
        JSON.stringify({
          error: error instanceof AIError ? error.code : 'unknown',
          message: error instanceof Error ? error.message : 'AI smoke failed',
        }),
      );
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await store.release(id);
  await db.close();
}
