import { json, setCookie, sha256, sign, SESSION } from './lib.js';

const SESSION_AGE = 8 * 60 * 60;

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || request.headers.get('X-Painel') !== '1') {
    return json({ error: 'Pedido recusado.' }, 403);
  }
  if (!env.ADMIN_PASSWORD || !env.ADMIN_LOGIN || !env.SESSION_SECRET || !env.GALLERY_LIMIT) {
    return json({ error: 'O login por palavra-passe ainda não está configurado.' }, 503);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await env.GALLERY_LIMIT.limit({ key: 'admin:' + ip })).success) {
    return json({ error: 'Demasiadas tentativas. Aguarda um minuto.' }, 429, { 'Retry-After': '60' });
  }
  const credentials = await request.json().catch(() => null);
  const { username, password } = credentials || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 128 || password.length > 1024) {
    return json({ error: 'Utilizador ou palavra-passe incorretos.' }, 401);
  }
  const actual = await sha256(password);
  const expected = await sha256(env.ADMIN_PASSWORD);
  let differences = 0;
  for (let index = 0; index < expected.length; index++) {
    differences |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (differences !== 0 || username !== env.ADMIN_LOGIN) {
    return json({ error: 'Utilizador ou palavra-passe incorretos.' }, 401);
  }
  const token = await sign({ login: env.ADMIN_LOGIN, exp: Date.now() + SESSION_AGE * 1000 }, env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESSION, token, SESSION_AGE) });
}
