# JPX-PLUS Configurations

Community configurations for [JPX-PLUS](https://github.com/MeiYongAI/JPX-PLUS). Browse and share from the configuration store in JPX-PLUS. GitHub identifies the author; a format check and DeepSeek review run before a revision appears in the catalog.

**Thanks to [闯关弟子](https://forums.e-hentai.org/index.php?showuser=4802944), the original JPX author.** This community store is an independent JPX-PLUS feature.

Install the optional [Config Store plugin](https://raw.githubusercontent.com/MeiYongAI/JPX-PLUS/main/JPX-PLUS-ConfigStore.user.js) alongside JPX-PLUS 2026.11.06.8 or later. Its tab appears inside Settings; browsing does not require login.

## How sharing works

1. Choose the current battle mode, full battle settings, or statistics settings. Supply a title and a short explanation of its intended use.
2. Sign in with GitHub and submit. The configuration becomes a public issue in this repository and is sent to DeepSeek for review.
3. A clean review publishes an immutable snapshot. Concrete format problems return to the author; uncertain results and custom JavaScript require a maintainer. Review does not execute rules or guarantee battle outcomes.
4. Edit your submission to update it. The previous approved version stays available while the new one is reviewed. Close it to withdraw it; archived snapshots remain in Git history.

Importing remains a separate player action in JPX-PLUS, with the usual undo and save controls. Existing installations do not silently adopt community updates.

## Maintainer setup

- Enable GitHub Actions in this repository and permit this workflow to write repository contents and issues. It checks out only the default branch; it never checks out contributor branches or executes submitted configuration code.
- Add the repository secret **`DEEPSEEK_API_KEY`** in **Settings → Secrets and variables → Actions**. Do not paste it into issues or the script.
- Optional Actions variables: `DEEPSEEK_MODEL` (default `deepseek-flash`), `REVIEW_DAILY_LIMIT` (default 50), and `REVIEW_AUTHOR_DAILY_LIMIT` (default 10). Limits count attempts, not successful approvals. Exhausted limits and API errors leave the revision unavailable until retried.
- In **Actions → Review shared configuration → Run workflow**, choose `retry`, `approve`, or `hide` and the issue number. Approval requires the full SHA-256 displayed by the bot for that exact pending revision. The actor must have write, maintain, or admin repository permission. `retry` also restores a hidden submission for a fresh review.

Ordinary issue events run promptly. A reconciliation run twice an hour handles events displaced by GitHub's workflow concurrency queue and withdrawals interrupted by an API error. GitHub may delay scheduled jobs. Only an approved snapshot is listed; an edited issue is never imported directly.

The workflow uses the built-in `GITHUB_TOKEN`, not a shared personal access token. Catalog updates use one atomic Git tree commit and never force-push. Each index entry includes the snapshot hash; clients should verify it before parsing. The `review-state/` directory stores public moderation state and daily request counts; it contains no secrets.

Run `npm test` with Node.js 22 or later. Tests use mocked API responses and do not spend API credits or publish issues.

---

# JPX-PLUS 配置分享

这是 JPX-PLUS 的社区配置仓库。玩家在脚本中的配置商店浏览、分享配置；投稿经过格式校验与 DeepSeek 审阅后上架。**特别感谢原版 JPX 作者[闯关弟子](https://forums.e-hentai.org/index.php?showuser=4802944)。** 本商店是 JPX-PLUS 的独立功能。

在 JPX-PLUS 2026.11.06.8 或更新版本之外，另行安装[配置商店插件](https://raw.githubusercontent.com/MeiYongAI/JPX-PLUS/main/JPX-PLUS-ConfigStore.user.js)，设置窗口中就会出现商店入口；浏览无需登录。

## 玩家使用

选择当前战斗模式、整套战斗设置或统计设置，填写名称与用途说明，用 GitHub 登录后提交。投稿在本仓库公开，并发送给 DeepSeek 审阅。格式问题会返回修改建议；存疑内容与自定义 JavaScript 需要维护者确认。审核只读取文本，不执行代码，也不保证战斗效果。

更新时编辑原投稿，新版审核期间保留已通过的旧版。关闭投稿即可下架；历史文件仍保存在 Git 历史中。配置导入仍由玩家操作，可撤销并手动保存，不会自动替换已安装的社区配置。

## 维护者配置

在仓库 **Settings → Secrets and variables → Actions** 添加密钥 `DEEPSEEK_API_KEY`。可选变量 `DEEPSEEK_MODEL` 默认 `deepseek-flash`；每日审核次数默认全仓库 50 次、每作者 10 次，分别通过 `REVIEW_DAILY_LIMIT` 与 `REVIEW_AUTHOR_DAILY_LIMIT` 调整。达到限制或接口异常不会自动放行。

在 **Actions → Review shared configuration → Run workflow** 填投稿编号，选择 `retry`（重审或恢复下架）、`approve`（批准）或 `hide`（下架）。批准必须填写 Bot 显示的完整待审核版本 SHA-256；投稿随后有修改时，旧哈希无法批准新版。仅具有仓库写入、维护或管理员权限的用户可操作。

Bot 通常由投稿事件触发，每半小时补查一次可能被 GitHub 并发队列丢弃的事件。检查与发布只使用默认分支代码；密钥不进入脚本、配置或评论。运行 `npm test` 可执行离线测试，无需 API 密钥。
