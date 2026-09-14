import { test, expect } from 'bun:test';
import { database } from '../src/server/database';
import { Store } from '../src/server/store';
import { Lab } from '../src/server/lab';

async function setup(fail = false) {
  const old = process.env.PGLITE_PATH;

  process.env.PGLITE_PATH = 'memory://';

  const db = await database();

  process.env.PGLITE_PATH = old;

  const store = new Store(db);

  await store.init();

  let calls = 0;
  const lab = new Lab(
    store,
    () => true,
    () => ({
      model: 'unit-fixture',
      complete: async () => {
        calls++;

        if (fail) throw Error('failed');

        return {
          text: `reply ${calls}`,
          usage: { input: 100, output: 10 },
          provider: 'fixture',
          model: 'unit-fixture',
        };
      },
    }),
  );

  await lab.init();

  return { db, lab, calls: () => calls };
}

test('blind comparisons resume, save idempotently, isolate reviewers and preserve provenance', async () => {
  const { db, lab, calls } = await setup();

  try {
    const first = await lab.next('owner', 'practice');

    expect(calls()).toBe(2);
    expect(first.pair).not.toBeNull();
    expect(JSON.stringify(first)).not.toContain('variant');
    expect(JSON.stringify(first)).not.toContain('prompt');
    expect((await lab.next('owner', 'practice')).pair?.id).toBe(first.pair!.id);
    expect(calls()).toBe(2);
    expect((await lab.state('other')).pair).toBeNull();

    const feedback = {
      id: first.pair!.id,
      choice: 'both_bad',
      tags: ['Wrong tone'],
      rewrite: 'my rewrite',
      note: 'too stiff',
    };

    await expect(lab.rate('other', feedback)).rejects.toThrow('not found');
    await lab.rate('owner', feedback);

    const saved = await lab.rate('owner', feedback);

    expect(saved.rated).toBe(1);
    expect(saved.pair).toBeNull();

    const exported = await lab.export('owner');

    expect(exported.comparisons).toHaveLength(1);
    expect(exported.comparisons[0]!.payload.candidates).toHaveLength(2);
    expect(exported.comparisons[0]!.rating).toEqual(feedback);
    expect((await lab.export('other')).comparisons).toHaveLength(0);

    const oldId = crypto.randomUUID();
    const oldPair = {
      ...exported.comparisons[0]!.payload,
      public: { ...first.pair!, id: oldId, batch: undefined },
    };

    await db.query('INSERT INTO lab_pairs(id,owner,case_id,payload) VALUES($1,$2,$3,$4::jsonb)', [
      oldId,
      'owner',
      'practice-1',
      JSON.stringify(oldPair),
    ]);

    await db.query('INSERT INTO lab_ratings(pair_id,payload) VALUES($1,$2::jsonb)', [
      oldId,
      JSON.stringify({ ...feedback, id: oldId }),
    ]);

    expect((await lab.state('owner')).rated).toBe(1);
    expect((await lab.state('owner')).previousRated).toBe(1);
    expect((await lab.export('owner')).comparisons).toHaveLength(2);
    await expect(lab.next('owner', 'check')).rejects.toThrow('8 practice');

    const next = await lab.next('owner', 'practice');

    expect(next.pair?.question).toBe('what is love');
    expect(next.pair?.human).not.toBe(first.pair?.human);
    expect(calls()).toBe(4);
  } finally {
    await db.close();
  }
});

test('failed generation releases unused allowance and does not create a partial pair', async () => {
  const { db, lab } = await setup(true);

  try {
    await expect(lab.next('owner', 'practice')).rejects.toThrow('generation failed');
    expect(lab.busy).toBe(false);
    expect((await lab.state('owner')).pair).toBeNull();

    const reservations = await db.query('SELECT * FROM reservations');

    expect(reservations).toHaveLength(0);

    const [usage] = await db.query<any>('SELECT * FROM daily_usage');

    expect(Number(usage.input_reserved)).toBe(0);
    expect(Number(usage.input_used)).toBe(7500);
  } finally {
    await db.close();
  }
});
