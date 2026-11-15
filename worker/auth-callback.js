import { cookie, setCookie, sign, SESSION } from './lib.js';

const fail = msg =>
  new Response(null, { status: 302, headers: { Location: '/admin.html#erro=' + encodeURIComponent(msg), 'Cache-Control': 'no-store' } });

// Step 2: GitHub sends the browser back here; confirm it is the site owner and open a session
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  if (!state || state !== cookie(request, '__Host-oauth')) return fail('O pedido de entrada expirou. Tenta de novo.');
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'diogomonteirophotos-painel' },
    body: JSON.stringify({
      client_id: env.GH_CLIENT_ID,
      client_secret: env.GH_CLIENT_SECRET,
      code: url.searchParams.get('code'),
      redirect_uri: new URL('/api/auth/callback', request.url).toString(),
    }),
  });
  const { access_token } = await tokenRes.json().catch(() => ({}));
  if (!access_token) return fail('O GitHub não confirmou a entrada.');
  const user = await fetch('https://api.github.com/user', {
    headers: { Authorization: 'Bearer ' + access_token, Accept: 'application/vnd.github+json', 'User-Agent': 'diogomonteirophotos-painel' },
  }).then(r => (r.ok ? r.json() : null));
  // the GitHub token is not kept: it was only needed to know who signed in
  fetch(`https://api.github.com/applications/${env.GH_CLIENT_ID}/token`, {
    method: 'DELETE',
    headers: {
      Authorization: 'Basic ' + btoa(env.GH_CLIENT_ID + ':' + env.GH_CLIENT_SECRET),
      Accept: 'application/vnd.github+json',
      'User-Agent': 'diogomonteirophotos-painel',
    },
    body: JSON.stringify({ access_token }),
  }).catch(() => {});
  if (!user || user.login !== env.ADMIN_LOGIN) return fail('Esta conta do GitHub não tem acesso ao painel.');
  const hours = 12;
  const session = await sign({ login: user.login, exp: Date.now() + hours * 3600e3 }, env.SESSION_SECRET);
  const headers = new Headers({ Location: '/admin.html', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', setCookie(SESSION, session, hours * 3600));
  headers.append('Set-Cookie', setCookie('__Host-oauth', '', 0));
  return new Response(null, { status: 302, headers });
}
