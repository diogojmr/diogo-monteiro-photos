import { json, verify, cookie, SESSION } from './lib.js';

export async function onRequestGet({ request, env }) {
  const session = await verify(cookie(request, SESSION), env.SESSION_SECRET);
  if (!session || session.login !== env.ADMIN_LOGIN) return json({ login: null }, 401);
  return json({ login: session.login, exp: session.exp });
}
