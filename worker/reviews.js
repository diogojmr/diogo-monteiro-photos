// Same rules as the panel (admin-assets/core.mjs normalizeReview)
const SPORTS = ['karting', 'hoquei', 'futsal', 'outro'];
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
export function normalizeReview(r) {
  if (!r || typeof r !== 'object') return null;
  const review = {
    name: clean(r.name, 60),
    team: clean(r.team, 60),
    sport: SPORTS.includes(r.sport) ? r.sport : 'outro',
    rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5))),
    text: clean(r.text, 600),
    lang: r.lang === 'es' ? 'es' : 'pt',
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : new Date().toISOString().slice(0, 10),
  };
  if (!review.name || !review.text) return null;
  let h = 2166136261;
  for (const ch of review.name + '|' + review.text + '|' + review.date) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  review.id = 'r-' + h.toString(36);
  return review;
}
export async function ensureTables(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS pending_reviews (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, ip_hash TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pending_reviews_ip ON pending_reviews (ip_hash, created_at)'),
  ]);
}
