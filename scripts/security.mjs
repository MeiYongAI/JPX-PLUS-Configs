// These are review candidates, not malware verdicts. Never execute submitted code.
export function securityCandidates(config) {
  const candidates = [];
  const add = (path, kind, source) => candidates.push({ path, kind, source });
  function visit(value, path = '$.config', key = '') {
    if (typeof value === 'string') {
      const style = key === 'styleText' || key.startsWith('s_');
      if (style && /["<>\\]|\/\*/.test(value)) {
        // JPX interpolates some styles into HTML attributes. Escapes/comments
        // also need inspection instead of assuming CSS spelling is literal.
        add(path, 'active-content', value);
      } else if (/(?:https?:|javascript\s*:|vbscript\s*:|data\s*:|@import\b|url\s*\(|expression\s*\(|<\/?[a-z!][^>]*>|\bon[a-z]+\s*=)/i.test(value)) {
        add(path, 'external-or-active-content', value);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && value.type === 'kamisamaniNattaHi') {
      add(path + '.code', 'executable-code', typeof value.code === 'string' ? value.code : '');
    }
    for (const [childKey, child] of Object.entries(value)) {
      if (value.type === 'kamisamaniNattaHi' && childKey === 'code') continue;
      const childPath = Array.isArray(value) ? `${path}[${childKey}]` : /^[\w]+$/.test(childKey) ? `${path}.${childKey}` : `${path}[${JSON.stringify(childKey)}]`;
      visit(child, childPath, childKey);
    }
  }
  visit(config);
  return candidates;
}

export function securityFindings(candidates) {
  return candidates.slice(0, 20).map(({ path, kind }) => ({
    severity: 'warning', path,
    en: kind === 'executable-code' ? 'Executable JavaScript requires a security review by a maintainer.' : 'External resources or active content require a security review by a maintainer.',
    zh: kind === 'executable-code' ? '含可执行 JavaScript，需要维护者复核安全性。' : '含外部资源或可疑页面内容，需要维护者复核安全性。'
  }));
}
