import { buildLegacyMessages } from './lab-baseline';
import { z } from 'zod';
import { createAI, buildMessages, PROMPT_VERSION, type AI, type AIOutput } from './ai';
import type { Store } from './store';
import { labCases } from './lab-cases';
import { feedbackTags, type LabPair, type LabState } from '../shared/lab';

export const LAB_BATCH = 'round-2-low-effort-v17';
const variants = [
  { id: 'style-fidelity-v15', profile: 'baseline' as const },
  { id: PROMPT_VERSION, profile: 'current' as const },
];
const rating = z.object({
  id: z.string().uuid(),
  choice: z.enum(['a', 'b', 'both_bad', 'both_good']),
  tags: z.array(z.enum(feedbackTags)).max(feedbackTags.length),
  rewrite: z.string().max(500),
  note: z.string().max(1000),
});

type Saved = {
  public: LabPair;
  candidates: {
    variant: string;
    text: string;
    model: string;
    prompt: unknown;
    usage: unknown;
    generation?: AIOutput['generation'];
  }[];
  createdAt: string;
};

export class Lab {
  busy = false;

  constructor(
    private store: Store,
    private canGenerate: () => boolean,
    private factory: (profile: 'baseline' | 'current') => AI = (profile) =>
      profile === 'baseline'
        ? createAI({ build: buildLegacyMessages, thinkingBudget: 256, maxTokens: 512 })
        : createAI(),
  ) {}

  async init() {
    await this.store.db.query(
      'CREATE TABLE IF NOT EXISTS lab_pairs(id text PRIMARY KEY, owner text NOT NULL, case_id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz DEFAULT now())',
    );

    await this.store.db.query(
      'CREATE TABLE IF NOT EXISTS lab_ratings(pair_id text PRIMARY KEY REFERENCES lab_pairs(id), payload jsonb NOT NULL, created_at timestamptz DEFAULT now())',
    );
  }

  async state(owner: string): Promise<LabState> {
    const rows = await this.store.db.query<{ case_id: string; payload: Saved; rated: boolean }>(
      'SELECT p.case_id,p.payload,(r.pair_id IS NOT NULL) AS rated FROM lab_pairs p LEFT JOIN lab_ratings r ON r.pair_id=p.id WHERE p.owner=$1 ORDER BY p.created_at DESC',
      [owner],
    );
    const current = rows.filter((r) => r.payload.public.batch === LAB_BATCH);
    const practiceTotal = labCases.filter((c) => c.set === 'practice').length;
    const practiceRated = current.filter(
      (r) => r.rated && r.payload.public.set === 'practice',
    ).length;

    return {
      pair: current.find((r) => !r.rated)?.payload.public ?? null,
      rated: current.filter((r) => r.rated).length,
      total: labCases.length,
      practiceRated,
      checkRated: current.filter((r) => r.rated && r.payload.public.set === 'check').length,
      checkUnlocked: practiceRated >= practiceTotal,
      batch: LAB_BATCH,
      practiceTotal,
      checkTotal: labCases.length - practiceTotal,
      previousRated: rows.filter((r) => r.rated && r.payload.public.batch !== LAB_BATCH).length,
    };
  }

  async next(owner: string, set: 'practice' | 'check') {
    const state = await this.state(owner);

    if (state.pair) return state;

    if (set === 'check' && !state.checkUnlocked)
      throw Error(`Rate the ${state.practiceTotal} practice cases before opening the check set.`);

    if (this.busy) throw Error('A comparison is generating. Try again shortly.');

    if (!this.canGenerate())
      throw Error(
        'Finish active games before generating comparisons so the local model stays responsive.',
      );
    // Acquire before the next await: generation is serialized across browser sessions.

    this.busy = true;

    const id = crypto.randomUUID();
    let reserved = false;

    try {
      const done = await this.store.db.query<{ case_id: string }>(
        'SELECT case_id FROM lab_pairs WHERE owner=$1',
        [owner],
      );
      const c = labCases.find((c) => c.set === set && !done.some((r) => r.case_id === c.id));

      if (!c) throw Error('This set is complete. Export your feedback to review the results.');

      if (!(await this.store.reserve(id)))
        throw Error('Daily local AI capacity reached. Try again after the reset.');

      reserved = true;

      const input = {
        label: 'B' as const,
        matchId: id,
        messages: [{ sender: 'judge' as const, text: c.question }],
        privateOpeningReference: c.human,
      };
      const candidates: Saved['candidates'] = [];

      for (const v of variants) {
        const ai = this.factory(v.profile);
        const request = await this.store.beginRequest(id, {
          purpose: 'feedback-comparison',
          variant: v.id,
          caseId: c.id,
          set: c.set,
        });
        let result;

        try {
          result = await ai.complete(input, AbortSignal.timeout(30000));
        } catch (e) {
          await this.store.settleRequest(request, null, { failed: true });

          throw Error('Local generation failed. Check the model service and try again.');
        }

        await this.store.settleRequest(request, result.usage, { model: result.model });

        candidates.push({
          variant: v.id,
          text: result.text,
          model: result.model,
          prompt: v.profile === 'baseline' ? buildLegacyMessages(input) : buildMessages(input),
          usage: result.usage,
          generation: result.generation,
        });
      }

      if (crypto.getRandomValues(new Uint32Array(1))[0]! % 2) candidates.reverse();

      const publicPair: LabPair = {
        id,
        batch: LAB_BATCH,
        question: c.question,
        human: c.human,
        category: c.category,
        set: c.set,
        a: candidates[0]!.text,
        b: candidates[1]!.text,
      };
      const saved: Saved = { public: publicPair, candidates, createdAt: new Date().toISOString() };

      await this.store.db.query(
        'INSERT INTO lab_pairs(id,owner,case_id,payload) VALUES($1,$2,$3,$4::jsonb)',
        [id, owner, c.id, JSON.stringify(saved)],
      );

      return await this.state(owner);
    } finally {
      if (reserved) await this.store.release(id);

      this.busy = false;
    }
  }

  async rate(owner: string, body: unknown) {
    const data = rating.parse(body);
    const [pair] = await this.store.db.query('SELECT id FROM lab_pairs WHERE id=$1 AND owner=$2', [
      data.id,
      owner,
    ]);

    if (!pair) throw Error('Comparison not found in this browser session.');

    await this.store.db.query(
      'INSERT INTO lab_ratings(pair_id,payload) VALUES($1,$2::jsonb) ON CONFLICT(pair_id) DO UPDATE SET payload=EXCLUDED.payload',
      [data.id, JSON.stringify(data)],
    );

    return this.state(owner);
  }

  async export(owner: string) {
    const rows = await this.store.db.query<{ payload: Saved; rating: unknown }>(
      'SELECT p.payload,r.payload AS rating FROM lab_pairs p LEFT JOIN lab_ratings r ON r.pair_id=p.id WHERE p.owner=$1 ORDER BY p.created_at',
      [owner],
    );

    return {
      version: 1,
      purpose: 'Prompt evaluation only. No model training.',
      exportedAt: new Date().toISOString(),
      comparisons: rows,
    };
  }
}
