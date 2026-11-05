import { createHash } from 'node:crypto';
import { MARKER, parseSubmission } from './validation.mjs';

const closed = issue => issue.state !== 'open';
const bodyHash = body => createHash('sha256').update(body || '').digest('hex');
const summary = (en, zh) => ({ en, zh });
const emptyCatalog = () => ({ schemaVersion: 1, updatedAt: null, entries: [] });

export async function processSubmission({ github, number, action, actor, command, expectedHash, review, now = () => new Date().toISOString(), limits = { total: 50, author: 10 } }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid issue number');
  let issue = await github.issue(number);
  if (issue.pull_request) return { skipped: 'pull-request' };
  const author = issue.user?.login;
  if (!/^[\w[\]-]+$/.test(author || '')) throw new Error('Invalid GitHub author');
  const statePath = `review-state/${number}.json`;
  const previous = await github.read(statePath, null);
  if (!issue.body?.startsWith(MARKER) && !previous) return { skipped: 'unrelated' };
  const initialBody = issue.body, initialHash = bodyHash(initialBody);
  const current = async () => {
    const live = await github.issue(number);
    return !closed(live) && bodyHash(live.body) === initialHash && live.user?.login === author;
  };
  const remove = async () => {
    const catalog = await github.read('catalog/index.json', emptyCatalog());
    if (catalog.entries.some(entry => entry.id === number)) {
      catalog.entries = catalog.entries.filter(entry => entry.id !== number); catalog.updatedAt = now();
      await github.commit({ 'catalog/index.json': catalog }, `Withdraw configuration #${number}`);
    }
    return { status: 'withdrawn' };
  };
  if (command && !await github.canMaintain(actor)) throw new Error('Maintainer permission required');
  if (closed(issue)) return remove();
  if (command === 'hide') {
    await github.commit({ [statePath]: { ...previous, hidden: true } }, `Hide configuration #${number}`);
    try { await github.request('labels', 'POST', { name: 'store:hide', color: '24292f' }); }
    catch (error) { if (error.status !== 422) throw error; }
    await github.request(`issues/${number}/labels`, 'POST', { labels: ['store:hide'] });
    return remove();
  }
  if (previous?.hidden) {
    if (command !== 'retry') return remove();
    try { await github.request(`issues/${number}/labels/${encodeURIComponent('store:hide')}`, 'DELETE'); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  let parsed;
  try { parsed = parseSubmission(initialBody); if (!parsed) throw new Error('Submission marker was removed'); }
  catch (error) {
    if (!await current()) return { skipped: 'stale' };
    if (previous?.bodyHash === initialHash && previous.status === 'changes-requested') {
      await github.setStatus(number, previous.status); await github.report(number, previous);
      return { skipped: 'already-reviewed' };
    }
    const metadata = { revision: initialHash, bodyHash: initialHash, status: 'changes-requested', summary: summary('The submission needs a format correction.', '投稿格式需要修改。'),
      findings: [error.finding || { severity: 'error', path: '$', en: 'Restore the JPX-PLUS submission format.', zh: '请恢复 JPX-PLUS 投稿格式。' }] };
    await github.commit({ [statePath]: metadata }, `Record validation result for #${number}`);
    await github.setStatus(number, metadata.status); await github.report(number, metadata);
    return metadata;
  }
  const { envelope, content, sha256, findings, manualRequired } = parsed;
  if (command === 'approve') {
    if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || expectedHash !== sha256 || previous?.revision !== sha256 || previous?.bodyHash !== initialHash || !['needs-review', 'unavailable'].includes(previous.status)) throw new Error('Approval must match the exact pending revision');
  } else if (!command && previous?.bodyHash === initialHash && previous.status !== 'pending' && action !== 'reopened') {
    const catalog = await github.read('catalog/index.json', emptyCatalog());
    if (previous.status !== 'published' || catalog.entries.some(entry => entry.id === number && entry.sha256 === sha256)) {
      await github.setStatus(number, previous.status); await github.report(number, previous);
      return { skipped: 'already-reviewed' };
    }
  }
  let result;
  if (command === 'approve') result = { verdict: 'pass', summary: summary(`Approved by maintainer ${actor}.`, `维护者 ${actor} 已确认。`), findings };
  else {
    const pending = { revision: sha256, bodyHash: initialHash, status: 'pending', summary: summary('Review in progress.', '正在审核。'), findings };
    if (!await current()) return { skipped: 'stale' };
    await github.setStatus(number, 'pending'); await github.report(number, pending);
    const day = now().slice(0, 10);
    let usage = await github.read('review-state/usage.json', { day, total: 0, authors: {} });
    if (usage.day !== day) usage = { day, total: 0, authors: {} };
    const authorCount = Object.hasOwn(usage.authors, author) ? usage.authors[author] : 0;
    if (usage.total >= limits.total || authorCount >= limits.author) {
      result = { verdict: 'unavailable', summary: summary('Daily review limit reached; a maintainer can retry later.', '已达到今日审核次数限制，维护者可稍后重试。'), findings: [] };
    } else {
      usage.total++; Object.defineProperty(usage.authors, author, { value: authorCount + 1, enumerable: true, configurable: true, writable: true });
      await github.commit({ 'review-state/usage.json': usage, [statePath]: pending }, `Start review for configuration #${number}`);
      try { result = await review(envelope); }
      catch { result = { verdict: 'unavailable', summary: summary('AI review is unavailable. This revision has not been published.', 'AI 审核暂不可用，此版本尚未上架。'), findings: [] }; }
    }
  }
  const status = result.verdict === 'unavailable' ? 'unavailable' : result.verdict === 'changes' ? 'changes-requested' : result.verdict === 'review' || manualRequired && command !== 'approve' ? 'needs-review' : 'published';
  const metadata = { revision: sha256, bodyHash: initialHash, status, summary: result.summary, findings: [...findings, ...result.findings].slice(0, 20) };
  if (status === 'needs-review' && result.verdict === 'pass') metadata.summary = summary('Maintainer review is required before publishing.', '上架前需要维护者确认。');
  if (!await current()) return { skipped: 'stale' };
  const files = { [statePath]: metadata };
  if (status === 'published') {
    const catalog = await github.read('catalog/index.json', emptyCatalog()), configPath = `catalog/configs/${number}-${sha256}.json`;
    const entry = { id: number, author, title: envelope.title, description: envelope.description, world: envelope.world, kind: envelope.kind,
      ...(envelope.mode ? { mode: envelope.mode } : {}), scriptVersion: envelope.scriptVersion, updatedAt: now(), sha256, configPath, issueUrl: `https://github.com/${github.repository}/issues/${number}` };
    catalog.entries = [...catalog.entries.filter(item => item.id !== number), entry].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); catalog.updatedAt = now();
    files['catalog/index.json'] = catalog; files[configPath] = content;
  }
  // Files are the exact inspected bytes, even if the author edits during the commit.
  await github.commit(files, `Record ${status} configuration #${number}`);
  issue = await github.issue(number);
  if (closed(issue)) return remove();
  if (bodyHash(issue.body) !== initialHash) return { skipped: 'edited-after-commit', status };
  await github.setStatus(number, status); await github.report(number, metadata);
  return metadata;
}
