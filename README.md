# JPX-PLUS Configurations

Community configurations for [JPX-PLUS](https://github.com/MeiYongAI/JPX-PLUS). Browse and share from the configuration store in JPX-PLUS. GitHub identifies the author; format and security checks run before a revision appears in the catalog. Review concerns device and data security, not battle strategy.

**Thanks to [闯关弟子](https://forums.e-hentai.org/index.php?showuser=4802944), the original JPX author.** This community store is an independent JPX-PLUS feature.

Install [JPX-PLUS](https://raw.githubusercontent.com/MeiYongAI/JPX-PLUS/main/JPX-PLUS.user.js) 2026.11.08.1 or later. Open **Configs → Store** inside Settings; browsing does not require login or a separate plugin.

## How sharing works

1. Choose a saved config in **My configs → More → Share**. Supply a title and a short explanation of its intended use. Single-mode, complete battle and statistics configs are supported.
2. Sign in with GitHub and submit. The configuration becomes a public issue in this repository. Ordinary rule data passes format checks without an AI strategy review.
3. Executable JavaScript, external resources and suspicious active content are sent to AI for security review and require maintainer approval. These are review candidates, not automatic malware verdicts. Format errors return to the author; battle choices, rule order, healing thresholds and descriptions are not graded or given improvement advice. The reviewer never executes submitted code.
4. Use **Shared → Update** to edit the same submission, optionally replacing its rules from a matching saved config. The previous approved version stays available while the new one is reviewed. Withdraw it to remove the listing, then remove its withdrawn record from your list if desired. GitHub records and local copies remain.

Saving from the Store adds a local copy to **My configs**. Apply it separately when ready. Updating a saved copy requires confirmation and does not apply it automatically. Existing installations do not silently adopt community updates. Catalog tags come from approved rule groups; optional mode metadata supports full-file filters without downloading every config.

## Maintainer setup

- Enable GitHub Actions in this repository and permit this workflow to write repository contents and issues. It checks out only the default branch; it never checks out contributor branches or executes submitted configuration code.
- Add the repository secret **`DEEPSEEK_API_KEY`** in **Settings → Secrets and variables → Actions**. Do not paste it into issues or the script.
- Optional Actions variables: `DEEPSEEK_MODEL` (default `deepseek-flash`), `REVIEW_DAILY_LIMIT` (default 50), and `REVIEW_AUTHOR_DAILY_LIMIT` (default 10). Limits count AI attempts, not successful approvals; ordinary rule data consumes none. API failures retry after at least 30 minutes and then 2 hours, up to three attempts per revision. Exhausted daily budgets resume on the next UTC day without consuming an attempt. Failed or interrupted reviews never bypass approval.
- In **Actions → Review shared configuration → Run workflow**, choose `retry`, `approve`, or `hide` and the issue number. Approval requires the full SHA-256 displayed by the bot for that exact pending revision. The actor must have write, maintain, or admin repository permission. `retry` also restores a hidden submission for a fresh review.
- `approve` can override an old AI-only objection or a failed service review, but cannot bypass format validation. `retry` resets the per-revision attempt limit and applies the current policy. Existing completed reviews are not silently overturned when the policy changes.

Only candidate source snippets go to AI; titles, descriptions and ordinary battle conditions are excluded. AI findings must identify an allowed security category, an exact candidate path and a matching source excerpt. This is static screening, not a guarantee that arbitrary code is safe. Custom code and suspicious content still need a maintainer even if AI reports no specific issue.

Ordinary issue events run promptly. A reconciliation run twice an hour handles events displaced by GitHub's workflow concurrency queue and withdrawals interrupted by an API error. GitHub may delay scheduled jobs. Only an approved snapshot is listed; an edited issue is never imported directly.

The workflow uses the built-in `GITHUB_TOKEN`, not a shared personal access token. Catalog updates use one atomic Git tree commit and never force-push. Each index entry includes the snapshot hash; clients should verify it before parsing. The `review-state/` directory stores public moderation state and daily request counts; it contains no secrets.

Run `npm test` with Node.js 22 or later. Tests use mocked API responses and do not spend API credits or publish issues.

Ratings are separate from discussion comments. The `Update configuration ratings` workflow reads marked 1–5 star votes, counts each GitHub user ID once, and stores `{count,sum}` in the catalog. The latest valid vote wins; comment ID breaks timestamp ties. Edits and deletions update totals, and the twice-hourly reconciliation catches displaced events. Configuration revisions retain the same rating history. Rating updates use default-branch code and share the catalog's commit queue without invoking AI review. Deploy both repositories to enable the complete feature.

---

# JPX-PLUS 配置分享

下载统计由 Cloudflare Worker 与 D1 提供，支持匿名访问与按天去重。[部署与统计口径](downloads/README.md)。

这是 JPX-PLUS 的社区配置仓库。玩家在脚本中的配置商店浏览、分享配置；投稿经过格式与安全检查后上架。审核只关注设备与数据安全，不评价战斗策略。**特别感谢原版 JPX 作者[闯关弟子](https://forums.e-hentai.org/index.php?showuser=4802944)。** 本商店是 JPX-PLUS 的独立功能。

安装 [JPX-PLUS](https://raw.githubusercontent.com/MeiYongAI/JPX-PLUS/main/JPX-PLUS.user.js) 2026.11.08.1 或更新版本，在设置中的**配置管理 → 商店**打开；无需另装插件，浏览也无需登录。

## 玩家使用

在**我的配置 → 更多 → 分享**选择已保存的单组规则、整套战斗配置或统计配置，填写名称与用途说明，用 GitHub 登录后提交。投稿在本仓库公开。普通规则通过格式检查即可上架，不交给 AI 评价策略；可执行 JavaScript、外部资源及可疑页面内容会进入 AI 安全审核，并交给维护者复核。存在代码不等于存在恶意。审核不评价配装、回血阈值、选怪顺序或说明质量，也不提供配置建议。

AI 只接收需要检查的源文本片段，必须指出安全问题的类别、位置与原文证据。标题、说明及普通战斗条件不发送给 AI。审核不执行投稿代码；静态检查不能保证任意代码安全，即使 AI 未发现问题，可执行代码和可疑内容仍需维护者确认。

在**已分享 → 更新**修改原投稿，也可选择匹配的本地副本更新规则；新版审核期间保留已通过的旧版。撤下后可从自己的列表移除记录，GitHub 历史与本地配置仍保留。从商店保存只添加本地副本，需要时再应用；更新已保存副本需要确认，不会自动应用。目录标签来自通过审核的实际规则组，多规则组文件可用可选元数据筛选，无需逐个下载。

## 维护者配置

在仓库 **Settings → Secrets and variables → Actions** 添加密钥 `DEEPSEEK_API_KEY`。可选变量 `DEEPSEEK_MODEL` 默认 `deepseek-flash`；每日 AI 审核次数默认全仓库 50 次、每作者 10 次，分别通过 `REVIEW_DAILY_LIMIT` 与 `REVIEW_AUTHOR_DAILY_LIMIT` 调整。普通规则不消耗 AI 额度。接口异常至少间隔 30 分钟、再间隔 2 小时重试，每版本最多尝试三次；额度耗尽则在下一个 UTC 日恢复，不计为一次尝试。失败或中断都不会自动放行。

在 **Actions → Review shared configuration → Run workflow** 填投稿编号，选择 `retry`（重审或恢复下架）、`approve`（批准）或 `hide`（下架）。批准必须填写 Bot 显示的完整待审核版本 SHA-256；投稿随后有修改时，旧哈希无法批准新版。仅具有仓库写入、维护或管理员权限的用户可操作。

维护者可以推翻旧版 AI 的误判，但不能跳过格式校验。`retry` 会重置该版本的自动尝试次数，并使用当前审核策略；已完成的旧审核不会因策略更新被悄悄改判。

Bot 通常由投稿事件触发，每半小时补查一次可能被 GitHub 并发队列丢弃的事件。检查与发布只使用默认分支代码；密钥不进入脚本、配置或评论。运行 `npm test` 可执行离线测试，无需 API 密钥。

评分与普通评论分开存储。`Update configuration ratings` 流程按 GitHub 账号 ID 去重，每个账号只统计最新的有效 1 至 5 星评分。修改或删除评分后更新目录中的总分和人数，每半小时补查遗漏事件；配置更新保留原有评分。汇总不调用 AI，也不会修改配置内容。需要同时发布主脚本和本仓库的评分流程。
