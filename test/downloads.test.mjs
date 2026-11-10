import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { createHandler } from '../downloads/worker.mjs';
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../downloads/schema.sql', import.meta.url), 'utf8'));
  let now = Date.parse('2026-11-10T08:00:00Z');
  const env = { DOWNLOAD_WRITES: { limit: async () => ({ success: true }) }, DOWNLOAD_READS: { limit: async () => ({ success: true }) },
    DB: {} };
  // Explicit statement execution preserves D1 metadata for inserts, including trigger updates.
  env.DB.prepare = function prepareD1(sql, args = []) { return { bind(...next) { return prepareD1(sql, next); },
    all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: db.prepare(sql).run(...args) }),
    execute: () => sql.startsWith('SELECT') ? { results: db.prepare(sql).all(...args) } : { meta: db.prepare(sql).run(...args) } }; };
  env.DB.batch = async statements => { db.exec('BEGIN'); try { const result = statements.map(s => s.execute()); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const handle = createHandler({ now: () => now, fetchImpl: async () => Response.json({ schemaVersion: 1, entries: [{ id: 5 }, { id: 6 }] }) });
  const post = (data = {}, headers = {}) => handle(new Request('https://test/v1/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ configId: 5, day: new Date(now).toISOString().slice(0, 10), visitor: 'a'.repeat(64), ...data }) }), env);
  return { db, env, handle, post, advance: ms => { now += ms; } };
}
test('download counter counts once per browser, config and UTC day, including concurrent requests', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 12 }, () => f.post()));
  const values = await Promise.all(responses.map(r => r.json()));
  assert.equal(values.filter(v => v.counted).length, 1); assert.ok(values.every(v => v.count === 1));
  assert.equal((await (await f.post({ visitor: 'b'.repeat(64) })).json()).count, 2);
  f.advance(86400000); assert.equal((await (await f.post()).json()).count, 3);
  assert.equal((await (await f.post({ configId: 6 })).json()).count, 1);
  const result = await f.handle(new Request('https://test/v1/downloads?ids=5,6,999'), f.env);
  assert.deepEqual(await result.json(), { counts: { 5: 3, 6: 1 } }); f.db.close();
});
test('download counter rejects invalid, unpublished, excessive and cross-site requests without counting', async () => {
  const f = fixture();
  for (const [data, status] of [[{ configId: 999 }, 404], [{ visitor: 'bad' }, 400], [{ token: 'secret' }, 400], [{ day: '2026-11-09' }, 409]])
    assert.equal((await f.post(data)).status, status);
  assert.equal((await f.post({}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.post({ visitor: 'x'.repeat(600) })).status, 413);
  f.env.DOWNLOAD_WRITES.limit = async () => ({ success: false }); assert.equal((await f.post()).status, 429);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM download_totals').get().n, 0); f.db.close();
});
test('download counter fails closed on unavailable catalog or storage and cleanup preserves totals', async () => {
  const f = fixture(); await f.post();
  const broken = createHandler({ fetchImpl: async () => { throw Error('offline'); } });
  assert.equal((await broken(new Request('https://test/v1/downloads?ids=5'), f.env)).status, 503);
  await worker.scheduled({ scheduledTime: Date.parse('2026-11-15T08:00:00Z') }, f.env);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM download_receipts').get().n, 0);
  assert.equal(f.db.prepare('SELECT count FROM download_totals WHERE config_id=5').get().count, 1); f.db.close();
});
