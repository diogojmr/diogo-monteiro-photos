import { setCookie } from './lib.js';

// Step 1 of "Entrar com GitHub": send the browser to GitHub with a one-time state
export async function onRequestGet({ request, env }) {
  const state = crypto.randomUUID();
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.GH_CLIENT_ID);
  url.searchParams.set('redirect_uri', new URL('/api/auth/callback', request.url).toString());
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  // no scope: the GitHub login is used only to know who you are; writes use the server token
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), 'Set-Cookie': setCookie('__Host-oauth', state, 600), 'Cache-Control': 'no-store' },
  });
}
