import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const upstream = 'https://family-bet-vova.limitlessvine2.chatgpt.site';
const files = new Map([
  ['/', { file: 'index.html', type: 'text/html' }],
  ['/app.js', { file: 'app.js', type: 'text/javascript' }],
  ['/style.css', { file: 'style.css', type: 'text/css' }],
]);
for (const asset of files.values()) {
  asset.body = await readFile(new URL('public/' + asset.file, import.meta.url));
}
const readRoutes = new Set(['/api/comments', '/api/stats']);
const maxBody = 4096;

function json(response, status, error) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    .end(JSON.stringify({ error }));
}

function sameOrigin(request) {
  try {
    const origin = new URL(request.headers.origin);
    return ['http:', 'https:'].includes(origin.protocol) &&
      (origin.host === request.headers.host || origin.host === request.headers['x-forwarded-host']);
  } catch {
    return false;
  }
}

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const asset = files.get(url.pathname);
  if (asset && ['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(200, { 'Content-Type': asset.type + '; charset=utf-8' })
      .end(request.method === 'HEAD' ? undefined : asset.body);
    return;
  }

  const vote = request.method === 'POST' && url.pathname === '/api/vote';
  if (!vote && !(request.method === 'GET' && readRoutes.has(url.pathname))) {
    return json(response, 404, 'Страница не найдена.');
  }

  const headers = { Accept: 'application/json' };
  let body;
  if (vote) {
    if (!sameOrigin(request)) return json(response, 403, 'Недопустимый источник запроса.');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
      return json(response, 415, 'Ожидается JSON.');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      length += chunk.length;
      if (length > maxBody) {
        request.resume();
        return json(response, 413, 'Слишком большой запрос.');
      }
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
    headers.Origin = upstream;
    headers['Content-Type'] = 'application/json';
  }

  const target = new URL(upstream);
  target.pathname = url.pathname;
  if (url.pathname === '/api/comments' && url.searchParams.has('before')) {
    target.searchParams.set('before', url.searchParams.get('before'));
  }
  const result = await fetch(target, {
    method: request.method, headers, body, redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  if (!result.headers.get('content-type')?.includes('application/json')) {
    return json(response, 502, 'Основной сайт временно недоступен.');
  }
  const data = await result.text();
  response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' }).end(data);
}

createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'");
  handle(request, response).catch(() => {
    if (!response.headersSent) json(response, 502, 'Основной сайт временно недоступен.');
    else response.end();
  });
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
