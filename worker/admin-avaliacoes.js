import { json, requireAdmin } from './lib.js';
import { ensureTables } from './reviews.js';

// Panel: list reviews waiting for approval, and remove one once approved or rejected
export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  await ensureTables(context.env.DB);
  const { results } = await context.env.DB.prepare('SELECT data FROM pending_reviews ORDER BY created_at').all();
  return json(results.map(r => JSON.parse(r.data)));
}
export async function onRequestDelete(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!/^r-[a-z0-9]{1,13}$/.test(id)) return json({ error: 'Avaliação inválida.' }, 400);
  await ensureTables(context.env.DB);
  await context.env.DB.prepare('DELETE FROM pending_reviews WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
