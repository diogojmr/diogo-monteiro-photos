// Cloudflare Worker: serves the static site exactly as it is in the repository
// (keeping the .html addresses) and answers the few /api/ routes.
import * as reviews from './avaliacoes.js';
import * as adminReviews from './admin-avaliacoes.js';
import * as login from './auth-login.js';
import * as callback from './auth-callback.js';
import * as me from './auth-me.js';
import * as logout from './auth-logout.js';
import * as gh from './gh.js';
import { json } from './lib.js';

const ROUTES = {
  '/api/avaliacoes': reviews,
  '/api/admin/avaliacoes': adminReviews,
  '/api/auth/login': login,
  '/api/auth/callback': callback,
  '/api/auth/me': me,
  '/api/auth/logout': logout,
};

function handlerFor(mod, method) {
  const name = 'onRequest' + method.charAt(0) + method.slice(1).toLowerCase();
  return mod[name] || mod.onRequest;
}

// Same behaviour as GitHub Pages: "/" and "/folder/" serve index.html,
// "/folder" redirects to "/folder/", every other address is served as is.
async function serveStatic(request, env, url) {
  if (url.pathname.endsWith('/')) {
    const index = new URL(url.pathname + 'index.html', url);
    return env.ASSETS.fetch(new Request(index, request));
  }
  const res = await env.ASSETS.fetch(request);
  if (res.status === 404 && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    const index = await env.ASSETS.fetch(new Request(new URL(url.pathname + '/index.html', url), request));
    if (index.ok) return Response.redirect(new URL(url.pathname + '/' + url.search, url), 301);
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return serveStatic(request, env, url);
    let mod = ROUTES[url.pathname];
    const params = {};
    if (!mod && url.pathname.startsWith('/api/gh/')) {
      mod = gh;
      params.path = url.pathname.slice('/api/gh/'.length).split('/').map(decodeURIComponent);
    }
    const handler = mod && handlerFor(mod, request.method);
    if (!handler) return json({ error: 'Não encontrado.' }, 404);
    try {
      return await handler({ request, env, params, waitUntil: p => ctx.waitUntil(p) });
    } catch (e) {
      console.error(e);
      return json({ error: 'Erro no servidor. Tenta novamente.' }, 500);
    }
  },
};
