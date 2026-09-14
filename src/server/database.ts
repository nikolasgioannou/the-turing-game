import postgres from 'postgres';
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export interface Query {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Query {
  transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function database(url?: string): Promise<Database> {
  if (url) {
    const sql = postgres(url, { max: 5, prepare: false, connect_timeout: 10 });
    const wrap = (client: any): Query => ({
      query: async <T>(q: string, p: unknown[] = []) =>
        Array.from(await client.unsafe(q, p)) as T[],
    });

    return {
      ...wrap(sql),
      transaction: (fn) => sql.begin(async (tx) => fn(wrap(tx))) as Promise<any>,
      close: () => sql.end(),
    };
  }

  const path = process.env.PGLITE_PATH ?? './data/local';

  if (!path.startsWith('memory:')) mkdirSync(path, { recursive: true });

  const pg = await PGlite.create(path);
  const wrap = (client: any): Query => ({
    query: async <T>(q: string, p: unknown[] = []) => (await client.query(q, p)).rows as T[],
  });

  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}
