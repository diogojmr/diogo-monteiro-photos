import { json, sha256 } from './lib.js';
import { normalizeReview, ensureTables } from './reviews.js';

// Public: a client sends a review. It waits in "Por aprovar" until approved in the panel.
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Origem não permitida.' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || body.website) return json({ ok: true }); // honeypot: pretend it worked
  if (body.consent !== true) return json({ error: 'Falta a autorização de publicação.' }, 400);
  const review = normalizeReview({ ...body, date: new Date().toISOString().slice(0, 10) });
  if (!review) return json({ error: 'Preenche o nome e o comentário.' }, 400);
  await ensureTables(env.DB);
  const ip = await sha256((request.headers.get('CF-Connecting-IP') || '') + '|' + env.SESSION_SECRET);
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM pending_reviews WHERE ip_hash = ? AND created_at > ?').bind(ip, since).first();
  if (n >= 5) return json({ error: 'Demasiados envios. Tenta mais tarde.' }, 429);
  const { n: total } = await env.DB.prepare('SELECT COUNT(*) AS n FROM pending_reviews').first();
  if (total >= 200) return json({ error: 'Não foi possível guardar agora. Tenta mais tarde.' }, 503);
  await env.DB.prepare('INSERT OR IGNORE INTO pending_reviews (id, data, created_at, ip_hash) VALUES (?, ?, ?, ?)')
    .bind(review.id, JSON.stringify(review), new Date().toISOString(), ip)
    .run();
  return json({ ok: true, id: review.id });
}
