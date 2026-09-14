import type { Database } from './database';

export const INPUT_PER_REQUEST = 7_500,
  OUTPUT_PER_REQUEST = 512;
export const MATCH_INPUT = 75_000,
  MATCH_OUTPUT = 5_120;

export type Allowance = { input: number; output: number };

// USD per million tokens for the pinned model (anthropic/claude-haiku-4.5 via OpenRouter).
// Token caps bound tokens; this bounds money even if a cap is misconfigured.
export const PRICE_PER_MILLION = { input: 1, output: 5 } as const;

export const costUsd = (usage: Allowance) =>
  (usage.input * PRICE_PER_MILLION.input + usage.output * PRICE_PER_MILLION.output) / 1_000_000;

export type Caps = Allowance & { usd?: number };

export class Store {
  constructor(
    public db: Database,
    public caps: Caps = { input: 1_000_000, output: 100_000 },
  ) {}

  // True when adding `extra` to the day's used + reserved totals would exceed any cap.
  exceeds(row: any, extra: Allowance) {
    const input = Number(row?.input_used ?? 0) + Number(row?.input_reserved ?? 0) + extra.input;
    const output = Number(row?.output_used ?? 0) + Number(row?.output_reserved ?? 0) + extra.output;

    return (
      input > this.caps.input ||
      output > this.caps.output ||
      (this.caps.usd !== undefined && costUsd({ input, output }) > this.caps.usd)
    );
  }

  async pauseAI(reason: string, untilAt: number) {
    await this.db.query('UPDATE service_state SET reason=$1,until_at=$2 WHERE id=1', [
      reason,
      untilAt,
    ]);
  }

  async resumeAI() {
    await this.db.query('UPDATE service_state SET reason=null,until_at=0 WHERE id=1');
  }

  async init() {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS match_outcomes(id text PRIMARY KEY, ai_won boolean NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS daily_usage(day text PRIMARY KEY, input_used bigint NOT NULL DEFAULT 0, output_used bigint NOT NULL DEFAULT 0, input_reserved bigint NOT NULL DEFAULT 0, output_reserved bigint NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS reservations(id text PRIMARY KEY, day text NOT NULL REFERENCES daily_usage(day), input_left bigint NOT NULL, output_left bigint NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS ai_requests(id text PRIMARY KEY, match_id text NOT NULL, day text NOT NULL, input_tokens bigint NOT NULL, output_tokens bigint NOT NULL, metadata jsonb NOT NULL, created_at timestamptz DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS service_state(id integer PRIMARY KEY, reason text, until_at bigint NOT NULL DEFAULT 0)`,
      `INSERT INTO service_state(id) VALUES(1) ON CONFLICT DO NOTHING`,
    ])
      await this.db.query(sql);
  }

  async saveOutcome(id: string, aiWon: boolean) {
    await this.db.query(
      'INSERT INTO match_outcomes(id,ai_won) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
      [id, aiWon],
    );
  }

  async recover() {
    // In-flight requests were pre-charged; only unused reservations are released.

    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE daily_usage SET input_reserved=0, output_reserved=0');
      await tx.query('DELETE FROM reservations');
    });
  }

  async availability(now = Date.now()) {
    const resetsAt =
      new Date(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z').getTime() + 86400000;
    const service = (
      await this.db.query<{ reason: string | null; until_at: string }>(
        'SELECT reason,until_at FROM service_state WHERE id=1',
      )
    )[0];

    if (service?.reason && Number(service.until_at) > now)
      return { available: false, message: service.reason, resetsAt: Number(service.until_at) };

    const row = (
      await this.db.query<any>('SELECT * FROM daily_usage WHERE day=$1', [
        new Date(now).toISOString().slice(0, 10),
      ])
    )[0];
    const available = !this.exceeds(row, { input: MATCH_INPUT, output: MATCH_OUTPUT });

    return {
      available,
      message: available ? null : 'The daily AI capacity has been reached. Try again tomorrow.',
      resetsAt,
    };
  }

  async score() {
    const [row] = await this.db.query<{ completed: string; ai_wins: string }>(
      'SELECT count(*) AS completed, count(*) FILTER (WHERE ai_won) AS ai_wins FROM match_outcomes',
    );

    return { completed: Number(row?.completed ?? 0), aiWins: Number(row?.ai_wins ?? 0) };
  }

  async reserve(id: string, now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10);

    return this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO daily_usage(day) VALUES($1) ON CONFLICT DO NOTHING', [day]);

      const [r] = await tx.query<any>('SELECT * FROM daily_usage WHERE day=$1 FOR UPDATE', [day]);

      if (this.exceeds(r, { input: MATCH_INPUT, output: MATCH_OUTPUT })) return false;

      await tx.query(
        'UPDATE daily_usage SET input_reserved=input_reserved+$2,output_reserved=output_reserved+$3 WHERE day=$1',
        [day, MATCH_INPUT, MATCH_OUTPUT],
      );

      await tx.query('INSERT INTO reservations VALUES($1,$2,$3,$4)', [
        id,
        day,
        MATCH_INPUT,
        MATCH_OUTPUT,
      ]);

      return true;
    });
  }

  async beginRequest(
    matchId: string,
    metadata: unknown,
    bound: Allowance = { input: INPUT_PER_REQUEST, output: OUTPUT_PER_REQUEST },
  ) {
    const id = crypto.randomUUID();

    await this.db.transaction(async (tx) => {
      const [r] = await tx.query<any>('SELECT * FROM reservations WHERE id=$1 FOR UPDATE', [
        matchId,
      ]);

      if (!r) throw new Error('No reserved AI capacity.');

      if (
        !Number.isSafeInteger(bound.input) ||
        !Number.isSafeInteger(bound.output) ||
        bound.input <= 0 ||
        bound.output <= 0
      )
        throw new Error('Invalid request allowance.');

      const extraInput = Math.max(0, bound.input - Number(r.input_left));
      const extraOutput = Math.max(0, bound.output - Number(r.output_left));
      const [day] = await tx.query<any>('SELECT * FROM daily_usage WHERE day=$1 FOR UPDATE', [
        r.day,
      ]);

      if (this.exceeds(day, { input: extraInput, output: extraOutput }))
        throw new Error('No daily AI capacity.');

      await tx.query(
        'UPDATE reservations SET input_left=input_left+$2,output_left=output_left+$3 WHERE id=$1',
        [matchId, extraInput, extraOutput],
      );

      await tx.query(
        'UPDATE daily_usage SET input_reserved=input_reserved+$2,output_reserved=output_reserved+$3 WHERE day=$1',
        [r.day, extraInput, extraOutput],
      );

      await tx.query(
        'UPDATE reservations SET input_left=input_left-$2,output_left=output_left-$3 WHERE id=$1',
        [matchId, bound.input, bound.output],
      );

      await tx.query(
        'UPDATE daily_usage SET input_reserved=input_reserved-$2,output_reserved=output_reserved-$3,input_used=input_used+$2,output_used=output_used+$3 WHERE day=$1',
        [r.day, bound.input, bound.output],
      );

      await tx.query(
        'INSERT INTO ai_requests(id,match_id,day,input_tokens,output_tokens,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [id, matchId, r.day, bound.input, bound.output, JSON.stringify(metadata)],
      );
    });

    return id;
  }

  async settleRequest(id: string, usage: Allowance | null, metadata: unknown) {
    await this.db.transaction(async (tx) => {
      const [r] = await tx.query<any>('SELECT * FROM ai_requests WHERE id=$1 FOR UPDATE', [id]);

      if (!r) return;

      const input = usage?.input ?? Number(r.input_tokens),
        output = usage?.output ?? Number(r.output_tokens);

      await tx.query(
        'UPDATE daily_usage SET input_used=input_used+$2,output_used=output_used+$3 WHERE day=$1',
        [r.day, input - Number(r.input_tokens), output - Number(r.output_tokens)],
      );

      await tx.query(
        'UPDATE ai_requests SET input_tokens=$2,output_tokens=$3,metadata=metadata || $4::jsonb WHERE id=$1',
        [id, input, output, JSON.stringify(metadata)],
      );
    });
  }

  async release(id: string) {
    await this.db.transaction(async (tx) => {
      const [r] = await tx.query<any>('SELECT * FROM reservations WHERE id=$1 FOR UPDATE', [id]);

      if (!r) return;

      await tx.query(
        'UPDATE daily_usage SET input_reserved=input_reserved-$2,output_reserved=output_reserved-$3 WHERE day=$1',
        [r.day, r.input_left, r.output_left],
      );

      await tx.query('DELETE FROM reservations WHERE id=$1', [id]);
    });
  }
}
