export const RATING_PREFIX = '<!-- JPX-PLUS-RATING:';
export const ratingBody = score => `<!-- JPX-PLUS-RATING:v1 {"score":${score}} -->\nRating: ${score}/5`;
export function ratingScore(body) {
  for (let score = 1; score <= 5; score++) if (body === ratingBody(score)) return score;
  return null;
}
export function summarizeRatings(comments, repository, number) {
  const votes = new Map(), issueURL = `https://api.github.com/repos/${repository}/issues/${number}`;
  for (const row of comments) {
    if (!row || typeof row !== 'object') continue;
    const score = ratingScore(row.body);
    if (!score || !Number.isSafeInteger(row.id) || row.id <= 0 || row.user?.type !== 'User' ||
        !Number.isSafeInteger(row.user.id) || row.user.id <= 0 || row.issue_url !== issueURL ||
        row.html_url !== `https://github.com/${repository}/issues/${number}#issuecomment-${row.id}` ||
        !Number.isFinite(Date.parse(row.updated_at))) continue;
    const previous = votes.get(row.user.id);
    if (!previous || Date.parse(row.updated_at) > Date.parse(previous.updated_at) ||
        Date.parse(row.updated_at) === Date.parse(previous.updated_at) && row.id > previous.id) votes.set(row.user.id, { ...row, score });
  }
  return { count: votes.size, sum: [...votes.values()].reduce((sum, row) => sum + row.score, 0) };
}
export async function readRatingComments(github, number) {
  const rows = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await github.request(`issues/${number}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw new Error('Invalid rating response');
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  throw new Error('Too many comments to count ratings safely');
}
export function ratingEventNumber(eventName, event) {
  if (eventName !== 'issue_comment') return null;
  if (event.issue?.pull_request || !['created', 'edited', 'deleted'].includes(event.action)) return false;
  if (![event.comment?.body, event.changes?.body?.from].some(body => typeof body === 'string' && body.startsWith(RATING_PREFIX))) return false;
  const number = event.issue?.number;
  return Number.isSafeInteger(number) && number > 0 ? number : false;
}
export async function syncRatings({ github, number = null, now = () => new Date().toISOString() }) {
  const catalog = await github.read('catalog/index.json', { schemaVersion: 1, entries: [] });
  const updates = new Map();
  for (const entry of catalog.entries) {
    if (number !== null && entry.id !== number) continue;
    updates.set(entry.id, summarizeRatings(await readRatingComments(github, entry.id), github.repository, entry.id));
  }
  // Merge only rating totals into the latest catalog; config revisions and dates stay intact.
  const latest = await github.read('catalog/index.json', { schemaVersion: 1, entries: [] });
  let changed = 0;
  for (const entry of latest.entries) {
    const rating = updates.get(entry.id);
    if (!rating || entry.rating?.count === rating.count && entry.rating?.sum === rating.sum) continue;
    entry.rating = rating; changed++;
  }
  if (changed) {
    latest.updatedAt = now();
    await github.commit({ 'catalog/index.json': latest }, 'Update configuration ratings');
  }
  return { changed };
}
