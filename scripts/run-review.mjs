import { readFile } from 'node:fs/promises';
import { GitHub } from './github.mjs';
import { processSubmission } from './review.mjs';
import { reviewWithDeepSeek } from './deepseek.mjs';

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const dispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
const scheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
const action = event.action;
const inputs = dispatch ? event.inputs || {} : {};
const number = Number(dispatch ? inputs.issue : event.issue?.number);
const command = dispatch ? inputs.action : undefined;
if (dispatch && !['approve', 'retry', 'hide'].includes(command)) throw new Error('Invalid review action');
const integer = (value, fallback) => /^[1-9]\d{0,4}$/.test(value || '') ? Number(value) : fallback;
const github = new GitHub({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, branch: event.repository.default_branch });
try {
  const options = { github, action, actor: process.env.GITHUB_ACTOR, command, expectedHash: inputs.sha256,
    limits: { total: integer(process.env.REVIEW_DAILY_LIMIT, 50), author: integer(process.env.REVIEW_AUTHOR_DAILY_LIMIT, 10) },
    review: candidates => reviewWithDeepSeek(candidates, { apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash' }) };
  if (scheduled) {
    // GitHub keeps only one pending concurrency run. Reconcile dropped events.
    const catalog = await github.read('catalog/index.json', { entries: [] });
    const issues = await github.openSubmissions();
    const numbers = [...new Set([...catalog.entries.map(entry => entry.id), ...issues.map(issue => issue.number)])];
    const started = Date.now();
    for (const id of numbers) {
      if (Date.now() - started > 150000) break;
      try {
        const result = await processSubmission({ ...options, number: id });
        console.log(JSON.stringify({ issue: id, status: result.status || result.skipped }));
      } catch {
        // One failed GitHub request must not starve later submissions.
        console.error(JSON.stringify({ issue: id, status: 'error' })); process.exitCode = 1;
      }
    }
  } else {
    const result = await processSubmission({ ...options, number });
    console.log(JSON.stringify({ issue: number, status: result.status || result.skipped }));
  }
} catch (error) {
  // Do not log HTTP response bodies, submitted content, or credentials.
  console.error(error.message); process.exitCode = 1;
}
