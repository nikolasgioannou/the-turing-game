import { database } from '../src/server/database';

const action = process.argv[2];

if (!['usage', 'resume-ai'].includes(action ?? ''))
  throw new Error('Usage: bun scripts/ops.ts usage|resume-ai');

const db = await database(process.env.DATABASE_URL);

try {
  if (action === 'usage') {
    console.log(await db.query('SELECT * FROM daily_usage ORDER BY day DESC LIMIT 7'));
    console.log(await db.query('SELECT reason,until_at FROM service_state WHERE id=1'));
  }

  if (action === 'resume-ai') {
    await db.query('UPDATE service_state SET reason=null,until_at=0 WHERE id=1');
    console.log('AI admission resumed.');
  }
} finally {
  await db.close();
}
