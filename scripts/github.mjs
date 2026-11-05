export class GitHub {
  constructor({ repository, token, branch, fetchImpl = fetch }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error('Missing repository or GitHub token');
    this.repository = repository; this.branch = branch; this.token = token; this.fetchImpl = fetchImpl;
  }
  async request(path, method = 'GET', body) {
    const response = await this.fetchImpl(`https://api.github.com/repos/${this.repository}/${path}`, {
      method, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw Object.assign(new Error(`GitHub request failed (${response.status})`), { status: response.status });
    return response.status === 204 ? null : response.json();
  }
  issue(number) { return this.request(`issues/${number}`); }
  async openSubmissions() {
    const result = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request(`issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`);
      result.push(...batch.filter(issue => !issue.pull_request && issue.body?.startsWith('<!-- JPX-PLUS-CONFIG:v1 -->')));
      if (batch.length < 100) break;
    }
    return result;
  }
  async canMaintain(actor) {
    if (!/^[\w[\]-]+$/.test(actor || '')) return false;
    try { return ['admin', 'maintain', 'write'].includes((await this.request(`collaborators/${encodeURIComponent(actor)}/permission`)).permission); }
    catch (error) { if ([403, 404].includes(error.status)) return false; throw error; }
  }
  async read(path, fallback) {
    try { const file = await this.request(`contents/${path}?ref=${encodeURIComponent(this.branch)}`); return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); }
    catch (error) { if (error.status === 404) return fallback; throw error; }
  }
  async commit(files, message) {
    // One tree update publishes snapshot and index together; never force the branch.
    const ref = await this.request(`git/ref/heads/${encodeURIComponent(this.branch)}`);
    const parent = await this.request(`git/commits/${ref.object.sha}`);
    const tree = await this.request('git/trees', 'POST', { base_tree: parent.tree.sha,
      tree: Object.entries(files).map(([path, value]) => ({ path, mode: '100644', type: 'blob', content: typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n' })) });
    const commit = await this.request('git/commits', 'POST', { message, tree: tree.sha, parents: [ref.object.sha] });
    await this.request(`git/refs/heads/${encodeURIComponent(this.branch)}`, 'PATCH', { sha: commit.sha, force: false });
  }
  async comments(number) {
    const result = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request(`issues/${number}/comments?per_page=100&page=${page}`); result.push(...batch);
      if (batch.length < 100) break;
    }
    return result;
  }
  async setStatus(number, status) {
    const names = ['pending', 'published', 'changes-requested', 'needs-review', 'unavailable'];
    const issue = await this.issue(number);
    for (const name of names) {
      if (name !== status && issue.labels.some(label => label.name === `store:${name}`)) {
        try { await this.request(`issues/${number}/labels/${encodeURIComponent('store:' + name)}`, 'DELETE'); }
        catch (error) { if (error.status !== 404) throw error; }
      }
    }
    const label = `store:${status}`;
    if (!issue.labels.some(item => item.name === label)) {
      try { await this.request('labels', 'POST', { name: label, color: ({ published: '2da44e', pending: 'd4c5f9', 'changes-requested': 'd73a4a', 'needs-review': 'fbca04', unavailable: '8b949e' })[status] }); }
      catch (error) { if (error.status !== 422) throw error; }
      await this.request(`issues/${number}/labels`, 'POST', { labels: [label] });
    }
  }
  async report(number, metadata) {
    const safe = JSON.stringify(metadata).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    const visible = text => String(text).replace(/[<>&`*_\[\]\\]/g, char => `&#${char.charCodeAt(0)};`).replace(/@/g, '&#64;');
    const body = `<!-- JPX-PLUS-REVIEW:v1 ${safe} -->\n**${visible(metadata.summary.en)}**\n\n${visible(metadata.summary.zh)}\n\n` +
      metadata.findings.map(item => `- ${visible(item.en)} / ${visible(item.zh)}`).join('\n') +
      `\n\nRevision / 版本：\`${metadata.revision}\`\n\nStatic review only; no combat or submitted code was executed. / 仅静态审核，未执行战斗或投稿代码。`;
    const previous = (await this.comments(number)).find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith('<!-- JPX-PLUS-REVIEW:v1 '));
    if (previous?.body === body) return;
    if (previous) await this.request(`issues/comments/${previous.id}`, 'PATCH', { body });
    else await this.request(`issues/${number}/comments`, 'POST', { body });
  }
}
