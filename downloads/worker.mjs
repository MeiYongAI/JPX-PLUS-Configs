const CATALOG = 'https://raw.githubusercontent.com/MeiYongAI/JPX-PLUS-Configs/main/catalog/index.json';
const CONFIG_ID = /^[1-9][0-9]{0,9}$/;
const allowedOrigin = origin => {
  if (!origin) return true;
  try { const url = new URL(origin); return ['https:', 'http:'].includes(url.protocol) &&
    (url.hostname === 'hentaiverse.org' || url.hostname.endsWith('.hentaiverse.org')) && !url.port; } catch { return false; }
};
export function createHandler({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cached, pending;
  async function catalog() {
    if (cached && now() - cached.at < 60000) return cached.ids;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetchImpl(CATALOG, { signal: AbortSignal.timeout(5000), cf: { cacheTtl: 60, cacheEverything: true } });
      if (!response.ok) throw Error('Catalog unavailable');
      const value = await response.json();
      if (value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 5000 ||
          value.entries.some(entry => !Number.isSafeInteger(entry.id) || entry.id < 1)) throw Error('Invalid catalog');
      cached = { ids: new Set(value.entries.map(entry => entry.id)), at: now() }; return cached.ids;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return async function handle(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin', ...(origin && allowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
    const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
    if (!allowedOrigin(origin)) return reply({ error: 'origin' }, 403);
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return reply({ ok: true });
    if (url.pathname !== '/v1/downloads') return reply({ error: 'not_found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method' }, 405, { Allow: 'GET, POST, OPTIONS' });
    try {
      // Cloudflare's edge limiter does not persist IP addresses in our database.
      const limiter = request.method === 'POST' ? env.DOWNLOAD_WRITES : env.DOWNLOAD_READS;
      if (!limiter || !(await limiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success)
        return reply({ error: 'rate_limit' }, 429, { 'Retry-After': '60' });
      if (request.method === 'GET') {
        const tokens = (url.searchParams.get('ids') || '').split(',');
        if (tokens.length > 100 || tokens.some(id => !CONFIG_ID.test(id))) return reply({ error: 'invalid_ids' }, 400);
        const published = await catalog(), ids = [...new Set(tokens.map(Number))].filter(id => published.has(id));
        const counts = Object.fromEntries(ids.map(id => [id, 0]));
        if (ids.length) {
          const query = 'SELECT config_id, count FROM download_totals WHERE config_id IN (' + ids.map(() => '?').join(',') + ')';
          const result = await env.DB.prepare(query).bind(...ids).all();
          for (const row of result.results) counts[row.config_id] = row.count;
        }
        return reply({ counts });
      }
      if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return reply({ error: 'content_type' }, 415);
      if (Number(request.headers.get('Content-Length')) > 512) return reply({ error: 'too_large' }, 413);
      // Bound streamed bodies too; Content-Length is optional and untrusted.
      const reader = request.body?.getReader(); if (!reader) return reply({ error: 'invalid_body' }, 400);
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > 512) { await reader.cancel(); return reply({ error: 'too_large' }, 413); } chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: 'invalid_body' }, 400); }
      if (!body || Object.keys(body).length !== 3 || !Number.isSafeInteger(body.configId) || !CONFIG_ID.test(String(body.configId)) ||
          typeof body.visitor !== 'string' || !/^[a-f0-9]{64}$/.test(body.visitor)) return reply({ error: 'invalid_body' }, 400);
      if (!(await catalog()).has(body.configId)) return reply({ error: 'unpublished' }, 404);
      const day = new Date(now()).toISOString().slice(0, 10);
      if (body.day !== day) return reply({ error: 'day_changed' }, 409);
      const results = await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO download_receipts(day, config_id, visitor) VALUES(?, ?, ?)').bind(day, body.configId, body.visitor),
        env.DB.prepare('SELECT count FROM download_totals WHERE config_id = ?').bind(body.configId)
      ]);
      return reply({ configId: body.configId, day, counted: results[0].meta.changes > 0, count: results[1].results[0].count });
    } catch { return reply({ error: 'unavailable' }, 503); }
  };
}
export default {
  fetch: createHandler(),
  async scheduled(event, env) {
    const cutoff = new Date(event.scheduledTime - 3 * 86400000).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM download_receipts WHERE day < ?').bind(cutoff).run();
  }
};
