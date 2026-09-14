import { database } from '../src/server/database';

const action = process.argv[2];

if (!['usage', 'resume-ai', 'pause-ai'].includes(action ?? ''))
  throw new Error('Usage: bun scripts/ops.ts usage|resume-ai|pause-ai [minutes] [reason]');

const db = await database(process.env.DATABASE_URL);

try {
  if (action === 'usage') {
    console.log(await db.query('SELECT * FROM daily_usage ORDER BY day DESC LIMIT 7'));
    console.log(await db.query('SELECT reason,until_at FROM service_state WHERE id=1'));
  }

  if (action === 'pause-ai') {
    const minutes = Number(process.argv[3] ?? 24 * 60);
    const reason = process.argv[4] ?? 'AI matches are paused by the operator. Try again later.';

    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('Minutes must be positive.');

    await db.query('UPDATE service_state SET reason=$1,until_at=$2 WHERE id=1', [
      reason,
      Date.now() + minutes * 60_000,
    ]);

    console.log(`AI admission paused for ${minutes} minutes.`);
  }

  if (action === 'resume-ai') {
    await db.query('UPDATE service_state SET reason=null,until_at=0 WHERE id=1');
    console.log('AI admission resumed.');
  }
} finally {
  await db.close();
}
