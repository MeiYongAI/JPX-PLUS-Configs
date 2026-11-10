import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingBody, ratingScore, summarizeRatings, ratingEventNumber, syncRatings, readRatingComments } from '../scripts/ratings.mjs';
const repository = 'MeiYongAI/JPX-PLUS-Configs';
const comment = (id, user, score, overrides = {}) => ({ id, user: { id: user, type: 'User' }, body: ratingBody(score),
  issue_url: `https://api.github.com/repos/${repository}/issues/12`, html_url: `https://github.com/${repository}/issues/12#issuecomment-${id}`,
  updated_at: '2026-11-10T01:00:00Z', ...overrides });
test('ratings count actual users once and ignore bots, unrelated comments and forged data', () => {
  const rows = [comment(1, 7, 1), comment(2, 7, 5), comment(3, 8, 3), comment(4, 9, 5, { user: { id: 9, type: 'Bot' } }),
    comment(5, 10, 5, { body: 'Useful config' }), comment(6, 11, 5, { issue_url: 'https://api.github.com/repos/other/repo/issues/12' }),
    comment(7, 12, 6), comment(8, 13, 5, { body: '<!-- JPX-PLUS-RATING:v1 {"score":5,"user":7} -->' }), null];
  assert.deepEqual(summarizeRatings(rows, repository, 12), { count: 2, sum: 8 });
  rows[0].updated_at = '2026-11-10T02:00:00Z';
  assert.deepEqual(summarizeRatings(rows, repository, 12), { count: 2, sum: 4 });
  assert.equal(ratingScore(ratingBody(5) + ' arbitrary text'), null);
});
test('rating events include deletion and edits that remove the marker, but exclude discussion and PRs', () => {
  const event = { action: 'created', issue: { number: 12 }, comment: { body: ratingBody(4) } };
  for (const action of ['created', 'edited', 'deleted']) assert.equal(ratingEventNumber('issue_comment', { ...event, action }), 12);
  assert.equal(ratingEventNumber('issue_comment', { ...event, action: 'edited', comment: { body: 'No rating' }, changes: { body: { from: ratingBody(4) } } }), 12);
  assert.equal(ratingEventNumber('issue_comment', { ...event, issue: { number: 12, pull_request: {} } }), false);
  assert.equal(ratingEventNumber('issue_comment', { ...event, comment: { body: 'Just a comment' } }), false);
  assert.equal(ratingEventNumber('schedule', {}), null);
});
test('rating sync adds, edits and removes totals without changing configuration metadata', async () => {
  const original = { id: 12, title: 'Config', sha256: 'a'.repeat(64), updatedAt: '2026-11-09T00:00:00Z' };
  let catalog = { schemaVersion: 1, updatedAt: original.updatedAt, entries: [structuredClone(original)] }, rows = [comment(1, 7, 5), comment(2, 8, 3)], commits = 0;
  const github = { repository, read: async () => structuredClone(catalog), request: async () => structuredClone(rows),
    commit: async files => { assert.deepEqual(Object.keys(files), ['catalog/index.json']); catalog = structuredClone(files['catalog/index.json']); commits++; } };
  assert.deepEqual(await syncRatings({ github, number: 12 }), { changed: 1 });
  assert.deepEqual(catalog.entries[0], { ...original, rating: { count: 2, sum: 8 } });
  assert.deepEqual(await syncRatings({ github, number: 12 }), { changed: 0 }); assert.equal(commits, 1);
  rows[0].body = ratingBody(1); await syncRatings({ github, number: 12 });
  assert.deepEqual(catalog.entries[0].rating, { count: 2, sum: 4 });
  rows = []; await syncRatings({ github }); assert.deepEqual(catalog.entries[0].rating, { count: 0, sum: 0 });
  assert.equal(catalog.entries[0].updatedAt, original.updatedAt);
  catalog.entries = []; await syncRatings({ github, number: 12 }); assert.equal(commits, 3);
});
test('rating pagination reads later votes and refuses partial totals on API errors or limits', async () => {
  let calls = 0;
  const github = { request: async () => ++calls === 1 ? Array.from({ length: 100 }, (_, i) => comment(i + 1, 7, 1)) : [comment(101, 8, 5)] };
  assert.equal((await readRatingComments(github, 12)).length, 101); assert.equal(calls, 2);
  let committed = false;
  await assert.rejects(syncRatings({ github: { repository, read: async () => ({ entries: [{ id: 12 }] }), request: async () => { throw Error('unavailable'); }, commit: async () => { committed = true; } } }));
  assert.equal(committed, false);
  await assert.rejects(readRatingComments({ request: async () => Array(100).fill(comment(1, 7, 1)) }, 12), /Too many comments/);
});
