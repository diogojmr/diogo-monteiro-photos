import { setCookie, SESSION } from './lib.js';

export async function onRequestPost() {
  return new Response(null, { status: 204, headers: { 'Set-Cookie': setCookie(SESSION, '', 0), 'Cache-Control': 'no-store' } });
}
