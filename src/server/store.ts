import { LIMITS } from '../shared/protocol';
import type { Database } from './database';
export const INPUT_PER_REQUEST = 7_500,
  OUTPUT_PER_REQUEST = 512;
export const MATCH_INPUT = INPUT_PER_REQUEST * LIMITS.aiRequests,
  MATCH_OUTPUT = OUTPUT_PER_REQUEST * LIMITS.aiRequests;
export type Allowance = { input: number; output: number };
export class Store {
  constructor(
    public db: Database,
    public caps: Allowance = { input: 1_000_000, output: 100_000 },
  ) {}
  async init() {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS matches(id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS daily_usage(day text PRIMARY KEY, input_used bigint NOT NULL DEFAULT 0, output_used bigint NOT NULL DEFAULT 0, input_reserved bigint NOT NULL DEFAULT 0, output_reserved bigint NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS reservations(id text PRIMARY KEY, day text NOT NULL REFERENCES daily_usage(day), input_left bigint NOT NULL, output_left bigint NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS ai_requests(id text PRIMARY KEY, match_id text NOT NULL, day text NOT NULL, input_tokens bigint NOT NULL, output_tokens bigint NOT NULL, metadata jsonb NOT NULL, created_at timestamptz DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS service_state(id integer PRIMARY KEY, reason text, until_at bigint NOT NULL DEFAULT 0)`,
      `INSERT INTO service_state(id) VALUES(1) ON CONFLICT DO NOTHING`,
    ])
      await this.db.query(sql);
  }
  async save(id: string, payload: unknown) {
    await this.db.query(
      'INSERT INTO matches(id,payload) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now()',
      [id, JSON.stringify(payload)],
    );
  }
  async load<T>(id: string): Promise<T | null> {
    return (
      (await this.db.query<{ payload: T }>('SELECT payload FROM matches WHERE id=$1', [id]))[0]
        ?.payload ?? null
    );
  }
  async recover() {
    // No reconnection: durable unfinished snapshots become failures after process restart.
    await this.db.query(
      `UPDATE matches SET payload=payload || '{"phase":"failed","deadline":null,"message":"The server restarted. This match wasn’t counted."}'::jsonb WHERE payload->>'phase' NOT IN ('complete','abandoned','failed')`,
    );
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
    const available =
      Number(row?.input_used ?? 0) + Number(row?.input_reserved ?? 0) + MATCH_INPUT <=
        this.caps.input &&
      Number(row?.output_used ?? 0) + Number(row?.output_reserved ?? 0) + MATCH_OUTPUT <=
        this.caps.output;
    return {
      available,
      message: available
        ? null
        : 'Today’s AI capacity has been reached. You can still watch games and browse replays.',
      resetsAt,
    };
  }
  async reserve(id: string, now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10);
    return this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO daily_usage(day) VALUES($1) ON CONFLICT DO NOTHING', [day]);
      const [r] = await tx.query<any>('SELECT * FROM daily_usage WHERE day=$1 FOR UPDATE', [day]);
      if (
        Number(r.input_used) + Number(r.input_reserved) + MATCH_INPUT > this.caps.input ||
        Number(r.output_used) + Number(r.output_reserved) + MATCH_OUTPUT > this.caps.output
      )
        return false;
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
  async beginRequest(matchId: string, metadata: unknown) {
    const id = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      const [r] = await tx.query<any>('SELECT * FROM reservations WHERE id=$1 FOR UPDATE', [
        matchId,
      ]);
      if (
        !r ||
        Number(r.input_left) < INPUT_PER_REQUEST ||
        Number(r.output_left) < OUTPUT_PER_REQUEST
      )
        throw new Error('No reserved AI capacity.');
      await tx.query(
        'UPDATE reservations SET input_left=input_left-$2,output_left=output_left-$3 WHERE id=$1',
        [matchId, INPUT_PER_REQUEST, OUTPUT_PER_REQUEST],
      );
      await tx.query(
        'UPDATE daily_usage SET input_reserved=input_reserved-$2,output_reserved=output_reserved-$3,input_used=input_used+$2,output_used=output_used+$3 WHERE day=$1',
        [r.day, INPUT_PER_REQUEST, OUTPUT_PER_REQUEST],
      );
      await tx.query(
        'INSERT INTO ai_requests(id,match_id,day,input_tokens,output_tokens,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [id, matchId, r.day, INPUT_PER_REQUEST, OUTPUT_PER_REQUEST, JSON.stringify(metadata)],
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
  async pause(reason: string, ms: number) {
    await this.db.query('UPDATE service_state SET reason=$1,until_at=$2 WHERE id=1', [
      reason,
      Date.now() + ms,
    ]);
  }
}
