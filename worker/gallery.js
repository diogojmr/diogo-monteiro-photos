import { cookie, json, setCookie, sha256, sign, verify } from './lib.js';

const SESSION = '__Host-djm-gallery';
const AGE = 3600;

export async function serveGallery(request, env, url) {
  const key = url.pathname.slice('/galerias/'.length);
  if (url.pathname === '/api/galerias/session') {
    if (request.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
    if (request.headers.get('Origin') !== url.origin) return json({ error: 'Pedido recusado.' }, 403);
    if (!env.GALLERY_PASSWORD || !env.SESSION_SECRET || !env.GALLERY_LIMIT || !env.GALLERY_BUCKET) {
      return json({ error: 'Galeria temporariamente indisponível.' }, 503);
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await env.GALLERY_LIMIT.limit({ key: ip })).success) {
      return json({ error: 'Demasiadas tentativas. Aguarde um minuto.' }, 429);
    }
    const password = (await request.json().catch(() => null))?.password;
    if (typeof password !== 'string' || password.length > 1024 ||
        await sha256(password) !== await sha256(env.GALLERY_PASSWORD)) {
      return json({ error: 'Palavra-passe incorreta.' }, 401);
    }
    const token = await sign({ scope: SESSION, exp: Date.now() + AGE * 1000 }, env.SESSION_SECRET);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESSION, token, AGE) });
  }
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Método inválido.' }, 405);
  const session = await verify(cookie(request, SESSION), env.SESSION_SECRET);
  if (session?.scope !== SESSION) return json({ error: 'Sessão necessária.' }, 401);
  if (!env.GALLERY_BUCKET) return json({ error: 'Galeria temporariamente indisponível.' }, 503);
  const object = await env.GALLERY_BUCKET.get(key);
  if (!object) return json({ error: 'Ficheiro indisponível.' }, 404);
  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers: {
      'Content-Type': key === 'manifest.json' ? 'application/json' : 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
