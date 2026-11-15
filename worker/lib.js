// Shared helpers for the site's server functions (Cloudflare Pages Functions).
// Secrets (set in the Cloudflare dashboard, never in the repository):
//   GITHUB_TOKEN      fine-grained token, Contents read/write on this repository only
//   GH_CLIENT_ID      GitHub OAuth app used only to identify the admin
//   GH_CLIENT_SECRET
//   SESSION_SECRET    random string used to sign the admin session cookie
// Plain vars (wrangler.toml): ADMIN_LOGIN, REPO

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const enc = new TextEncoder();
const b64url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));

async function hmacKey(secret) {
  if (!secret || secret.length < 32) throw Error('SESSION_SECRET em falta ou demasiado curto');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64url(sig);
}
export async function verify(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function cookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
export const SESSION = '__Host-painel';
export const setCookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// Admin endpoints: valid session cookie + a custom header (blocks cross-site form posts)
export async function requireAdmin(context) {
  const { request, env } = context;
  const session = await verify(cookie(request, SESSION), env.SESSION_SECRET);
  if (!session || session.login !== env.ADMIN_LOGIN) return json({ error: 'Sessão terminada. Entra novamente.' }, 401);
  if (request.method !== 'GET' && request.headers.get('X-Painel') !== '1') return json({ error: 'Pedido recusado.' }, 403);
  return null;
}

export async function github(env, path, init = {}) {
  return fetch((env.GITHUB_API || 'https://api.github.com') + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'diogomonteirophotos-painel',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

export async function sha256(text) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
