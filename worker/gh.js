import { json, requireAdmin, github } from './lib.js';

// The panel talks to GitHub through here: the token stays on the server and
// only this repository's git and contents endpoints are reachable.
const ALLOWED = /^(git\/(ref\/heads\/main|refs\/heads\/main|commits|commits\/[0-9a-f]{40}|trees|trees\/[0-9a-f]{40}|blobs)|contents\/[A-Za-z0-9._\/-]+)$/;

export async function onRequest(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { request, env, params } = context;
  const rest = (params.path || []).join('/');
  if (!['GET', 'POST', 'PATCH'].includes(request.method) || !ALLOWED.test(rest) || rest.includes('..'))
    return json({ error: 'Pedido não permitido.' }, 403);
  const query = new URL(request.url).search;
  const res = await github(env, `/repos/${env.REPO}/${rest}${query}`, {
    method: request.method,
    body: request.method === 'GET' ? undefined : await request.text(),
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' },
  });
}
