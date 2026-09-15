import type { Database } from './database';

export class Store {
  constructor(public db: Database) {}

  async init() {
    await this.db.query(
      'CREATE TABLE IF NOT EXISTS match_outcomes(id text PRIMARY KEY, ai_won boolean NOT NULL)',
    );
  }

  async saveOutcome(id: string, aiWon: boolean) {
    await this.db.query(
      'INSERT INTO match_outcomes(id,ai_won) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
      [id, aiWon],
    );
  }

  async score() {
    const [row] = await this.db.query<{ completed: string; ai_wins: string }>(
      'SELECT count(*) AS completed, count(*) FILTER (WHERE ai_won) AS ai_wins FROM match_outcomes',
    );

    return { completed: Number(row?.completed ?? 0), aiWins: Number(row?.ai_wins ?? 0) };
  }
}
