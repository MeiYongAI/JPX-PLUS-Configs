import { createHash } from 'node:crypto';
import { MARKER, MODES, parseSubmission } from './validation.mjs';
import { parseVerdict } from './deepseek.mjs';

const closed = issue => issue.state !== 'open';
const bodyHash = body => createHash('sha256').update(body || '').digest('hex');
const summary = (en, zh) => ({ en, zh });
const emptyCatalog = () => ({ schemaVersion: 1, updatedAt: null, entries: [] });
const MAX_ATTEMPTS = 3;
const retryTime = (timestamp, attempts) => attempts >= MAX_ATTEMPTS ? null : new Date(Date.parse(timestamp) + (attempts < 2 ? 30 : 120) * 60000).toISOString();

export async function processSubmission({ github, number, action, actor, command, expectedHash, review, now = () => new Date().toISOString(), limits = { total: 50, author: 10 } }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid issue number');
  if (command && !['approve', 'retry', 'hide'].includes(command)) throw new Error('Invalid review action');
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
    if (command !== 'retry' && previous?.bodyHash === initialHash && previous.status === 'changes-requested' && previous.reviewSource === 'format') {
      await github.setStatus(number, previous.status); await github.report(number, previous);
      return { skipped: 'already-reviewed' };
    }
    const metadata = { revision: initialHash, bodyHash: initialHash, status: 'changes-requested', reviewSource: 'format', summary: summary('The submission needs a format correction.', '投稿格式需要修改。'),
      findings: [error.finding || { severity: 'error', path: '$', en: 'Restore the JPX-PLUS submission format.', zh: '请恢复 JPX-PLUS 投稿格式。' }] };
    await github.commit({ [statePath]: metadata }, `Record validation result for #${number}`);
    await github.setStatus(number, metadata.status); await github.report(number, metadata);
    return metadata;
  }
  const { envelope, content, sha256, findings, candidates, manualRequired } = parsed;
  const timestamp = now(), sameRevision = previous?.bodyHash === initialHash && previous?.revision === sha256;
  let attempts = sameRevision && command !== 'retry' ? previous.attempts ?? (['pending', 'unavailable'].includes(previous.status) ? 1 : 0) : 0;
  const recovering = sameRevision && ['pending', 'unavailable'].includes(previous.status);
  const retryDue = !previous?.retry?.nextAt || Date.parse(previous.retry.nextAt) <= Date.parse(timestamp);
  const canRetry = recovering && retryDue && (attempts < MAX_ATTEMPTS || previous.status === 'pending');
  if (command === 'approve') {
    if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || expectedHash !== sha256 || !sameRevision || previous.reviewSource === 'format' || !['needs-review', 'unavailable', 'changes-requested'].includes(previous.status)) throw new Error('Approval must match the exact pending revision');
  } else if (!command && sameRevision && !canRetry && (action !== 'reopened' || previous.status !== 'published')) {
    const catalog = await github.read('catalog/index.json', emptyCatalog());
    if (previous.status !== 'published' || catalog.entries.some(entry => entry.id === number && entry.sha256 === sha256)) {
      await github.setStatus(number, previous.status); await github.report(number, previous);
      return { skipped: 'already-reviewed' };
    }
  }
  let result, retry;
  if (command === 'approve') result = { verdict: 'pass', summary: summary(`Approved by maintainer ${actor}.`, `维护者 ${actor} 已确认。`), findings: [] };
  else if (!manualRequired) {
    // Ordinary rule data never goes to AI for strategy scoring or advice.
    result = { verdict: 'pass', summary: summary('Format checks passed; no executable code or suspicious content detected.', '格式检查通过，未检测到可执行代码或可疑内容。'), findings: [] };
  } else if (attempts >= MAX_ATTEMPTS) {
    result = { verdict: 'unavailable', summary: summary('Automatic security review stopped after three attempts. A maintainer can review or retry.', '安全审核已尝试三次，等待维护者复核或重新发起审核。'), findings: [] };
    retry = { reason: 'service', nextAt: null };
  } else {
    if (!await current()) return { skipped: 'stale' };
    const day = timestamp.slice(0, 10);
    let usage = await github.read('review-state/usage.json', { day, total: 0, authors: {} });
    if (usage.day !== day) usage = { day, total: 0, authors: {} };
    const authorCount = Object.hasOwn(usage.authors, author) ? usage.authors[author] : 0;
    if (usage.total >= limits.total || authorCount >= limits.author) {
      result = { verdict: 'unavailable', summary: summary('Daily security review limit reached; queued for the next UTC day.', '今日安全审核额度已用完，将于下一个 UTC 日自动重试。'), findings: [] };
      retry = { reason: 'daily-limit', nextAt: new Date(Date.parse(day + 'T00:00:00.000Z') + 86400000).toISOString() };
    } else {
      attempts++;
      const pending = { revision: sha256, bodyHash: initialHash, status: 'pending', reviewSource: 'security', attempts,
        retry: { reason: 'service', nextAt: retryTime(timestamp, attempts) }, summary: summary('Security review in progress.', '正在进行安全审核。'), findings };
      usage.total++; Object.defineProperty(usage.authors, author, { value: authorCount + 1, enumerable: true, configurable: true, writable: true });
      await github.commit({ 'review-state/usage.json': usage, [statePath]: pending }, `Start review for configuration #${number}`);
      await github.setStatus(number, 'pending'); await github.report(number, pending);
      try { result = parseVerdict(JSON.stringify(await review(candidates)), candidates); }
      catch {
        retry = pending.retry;
        result = { verdict: 'unavailable', summary: retry.nextAt
          ? summary('AI security review is unavailable; an automatic retry is scheduled.', 'AI 安全审核暂不可用，已安排自动重试。')
          : summary('Automatic security review stopped after three attempts. A maintainer can review or retry.', '安全审核已尝试三次，等待维护者复核或重新发起审核。'), findings: [] };
      }
    }
  }
  const status = result.verdict === 'unavailable' ? 'unavailable' : manualRequired && command !== 'approve' ? 'needs-review' : 'published';
  const metadata = { revision: sha256, bodyHash: initialHash, status, reviewSource: command === 'approve' ? 'maintainer' : manualRequired ? 'security' : 'format',
    attempts, ...(retry ? { retry } : {}), summary: result.summary, findings: [...result.findings, ...findings].slice(0, 20) };
  if (status === 'needs-review' && result.verdict === 'pass') metadata.summary = summary('Executable code or suspicious content requires maintainer security review.', '可执行代码或可疑内容需要维护者复核安全性。');
  if (!await current()) return { skipped: 'stale' };
  const files = { [statePath]: metadata };
  if (status === 'published') {
    const catalog = await github.read('catalog/index.json', emptyCatalog()), configPath = `catalog/configs/${number}-${sha256}.json`;
    const entry = { id: number, author, title: envelope.title, description: envelope.description, world: envelope.world, kind: envelope.kind,
      ...(envelope.mode ? { mode: envelope.mode } : {}),
      modes: envelope.kind === 'stats' ? [] : envelope.mode ? [envelope.mode] : [...MODES].filter(mode => Object.entries(envelope.config[mode] || {}).some(([key, rules]) =>
        (key === 'rules' || key === 'supports' || key === 'attacks' || key.startsWith('kb_')) && Array.isArray(rules) && rules.length)),
      scriptVersion: envelope.scriptVersion, updatedAt: now(), sha256, configPath, issueUrl: `https://github.com/${github.repository}/issues/${number}` };
    const rating = catalog.entries.find(item => item.id === number)?.rating;
    if (rating) entry.rating = rating;
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
